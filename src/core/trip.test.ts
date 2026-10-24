import { describe, expect, it } from '@jest/globals';

import { hours, minutes, seconds } from './duration';
import { getDefaultSettings } from './profiles';
import {
  advanceTripTime,
  changeTripChannel,
  currentCheckInterval,
  isCheckActive,
  nextTripDeadline,
  processTripSpeedSample,
  respondToCheck,
  startTrip,
  type TripConfig,
  type TripEffect,
  type TripState,
  toggleTripSilence,
} from './trip';
import type { VehicleType } from './types';

const BRASILIA_OFFSET = -180;
const MORNING = Date.UTC(2026, 9, 24, 12, 0, 0);
const NIGHT = Date.UTC(2026, 9, 24, 4, 0, 0);
const CRUISING_KMH = 80;
const STOPPED_KMH = 0;
const STEP = seconds(1);

interface Segment {
  duration: number;
  speedKmh: number;
}

type Responder = (checkIndex: number) => number | null;

function config(vehicleType: VehicleType, startedAt = MORNING): TripConfig {
  return {
    vehicleType,
    settings: getDefaultSettings(vehicleType),
    utcOffsetMinutes: BRASILIA_OFFSET,
    startedAt,
  };
}

function driving(duration: number): Segment {
  return { duration, speedKmh: CRUISING_KMH };
}

function stopped(duration: number): Segment {
  return { duration, speedKmh: STOPPED_KMH };
}

function simulate(
  tripConfig: TripConfig,
  segments: Segment[],
  responder: Responder,
): { trip: TripState; effects: TripEffect[] } {
  let trip = startTrip(tripConfig);
  const effects: TripEffect[] = [];
  let checkCount = 0;
  let pendingResponseAt: number | null = null;
  let at = tripConfig.startedAt;

  function collect(update: { trip: TripState; effects: TripEffect[] }) {
    trip = update.trip;
    effects.push(...update.effects);
    for (const effect of update.effects) {
      if (effect.type === 'checkStarted') {
        const delay = responder(checkCount);
        checkCount += 1;
        pendingResponseAt = delay === null ? null : effect.at + delay;
      }
    }
  }

  for (const segment of segments) {
    const end = at + segment.duration;
    for (; at < end; at += STEP) {
      if (pendingResponseAt !== null && pendingResponseAt <= at) {
        const responseAt = pendingResponseAt;
        pendingResponseAt = null;
        collect(respondToCheck(trip, responseAt));
      }
      collect(processTripSpeedSample(trip, { at, speedKmh: segment.speedKmh }));
    }
  }
  return { trip, effects };
}

function ofType<T extends TripEffect['type']>(effects: TripEffect[], type: T) {
  return effects.filter((effect): effect is Extract<TripEffect, { type: T }> => effect.type === type);
}

const alwaysQuick: Responder = () => seconds(5);
const neverResponds: Responder = () => null;

describe('Início da viagem', () => {
  it('começa parada, sem verificação ativa e com os canais no padrão (RF10)', () => {
    const trip = startTrip(config('car'));
    expect(isCheckActive(trip)).toBe(false);
    expect(trip.driveTimer.movement).toBe('stopped');
    expect(trip.channels).toEqual({ soundEnabled: true, vibrationEnabled: true, silenced: false });
    expect(nextTripDeadline(trip)).toBeNull();
  });
});

describe('RF05 - verificações periódicas na viagem', () => {
  it('automóvel com respostas rápidas é verificado a cada 15 minutos', () => {
    const { effects } = simulate(config('car'), [driving(minutes(46))], alwaysQuick);
    const starts = ofType(effects, 'checkStarted').map((effect) => effect.at - MORNING);
    expect(starts).toEqual([minutes(15), minutes(30) + seconds(5), minutes(45) + seconds(10)]);
    expect(ofType(effects, 'stageEntered')).toEqual([]);
  });

  it('caminhão de madrugada é verificado a cada 5 minutos', () => {
    const { effects } = simulate(config('truck', NIGHT), [driving(minutes(11))], alwaysQuick);
    const starts = ofType(effects, 'checkStarted');
    expect(starts.map((effect) => effect.at - NIGHT)).toEqual([minutes(5), minutes(10) + seconds(5)]);
    expect(starts.every((effect) => effect.reasons.includes('night'))).toBe(true);
  });

  it('não verifica com o veículo parado', () => {
    const { effects } = simulate(config('truck'), [stopped(hours(1))], alwaysQuick);
    expect(ofType(effects, 'checkStarted')).toEqual([]);
  });
});

describe('RF07 e RF08 - escalonamento dentro da viagem', () => {
  it.each([
    ['truck', [15, 30, 45]],
    ['bus', [15, 25, 35]],
  ] as const)('perfil %s sem resposta chega à etapa máxima nos tempos do Quadro 1', (vehicleType, expected) => {
    const { effects } = simulate(config(vehicleType), [driving(minutes(12))], neverResponds);
    const checkAt = ofType(effects, 'checkStarted')[0]?.at ?? 0;
    expect(ofType(effects, 'stageEntered').map((effect) => [effect.stage, effect.at - checkAt])).toEqual([
      ['preventive', seconds(expected[0])],
      ['mandatory', seconds(expected[1])],
      ['maximum', seconds(expected[2])],
    ]);
  });

  it('sem resposta, não inicia outra verificação enquanto o alerta continua', () => {
    const { effects, trip } = simulate(config('truck'), [driving(minutes(40))], neverResponds);
    expect(ofType(effects, 'checkStarted')).toHaveLength(1);
    expect(isCheckActive(trip)).toBe(true);
  });

  it('a resposta registra o tempo total e a etapa máxima', () => {
    const { effects } = simulate(config('truck'), [driving(minutes(11))], () => seconds(31));
    expect(ofType(effects, 'checkResolved')[0]?.outcome).toMatchObject({
      responseTime: seconds(31),
      maxStage: 'mandatory',
      simulatedLevel: 8,
    });
  });

  it('resposta dentro da janela registra nível simulado 6', () => {
    const { effects } = simulate(config('car'), [driving(minutes(16))], alwaysQuick);
    expect(ofType(effects, 'checkResolved')[0]?.outcome).toMatchObject({
      responseTime: seconds(5),
      maxStage: 'check',
      simulatedLevel: 6,
    });
  });
});

describe('RF04 - pausa na viagem', () => {
  it('automóvel emite pré-aviso e lembrete e passa a verificar a cada 5 minutos', () => {
    const { effects } = simulate(config('car'), [driving(hours(2) + minutes(11))], alwaysQuick);
    expect(ofType(effects, 'breakPreWarning').map((effect) => effect.at - MORNING)).toEqual([hours(1.75)]);
    expect(ofType(effects, 'breakReminder').map((effect) => effect.at - MORNING)).toEqual([hours(2)]);
    const afterReminder = ofType(effects, 'checkStarted').filter((effect) => effect.at > MORNING + hours(2));
    expect(afterReminder.length).toBeGreaterThan(0);
    expect(afterReminder.every((effect) => effect.interval === minutes(5))).toBe(true);
    expect(afterReminder.every((effect) => effect.reasons.includes('breakOverdue'))).toBe(true);
  });

  it('uma pausa válida registra a pausa e volta ao intervalo diurno', () => {
    const { effects, trip } = simulate(
      config('car'),
      [driving(hours(2)), stopped(minutes(15)), driving(minutes(1))],
      alwaysQuick,
    );
    expect(ofType(effects, 'breakRegistered')).toHaveLength(1);
    expect(currentCheckInterval(trip, trip.lastUpdateAt).interval).toBe(minutes(15));
  });
});

describe('RF13 - episódios recorrentes na viagem', () => {
  it('dois episódios seguidos na etapa obrigatória recomendam parada e reduzem o intervalo', () => {
    const { effects, trip } = simulate(config('truck'), [driving(minutes(22))], () => seconds(31));
    expect(ofType(effects, 'stopRecommended')).toHaveLength(1);
    expect(currentCheckInterval(trip, trip.lastUpdateAt)).toEqual({
      interval: minutes(5),
      reasons: ['recurrentEpisodes'],
    });
  });

  it('a pausa registrada encerra a redução por episódios recorrentes', () => {
    const { trip, effects } = simulate(
      config('truck'),
      [driving(minutes(22)), stopped(minutes(30)), driving(minutes(1))],
      () => seconds(31),
    );
    expect(ofType(effects, 'stopRecommended')).toHaveLength(1);
    expect(currentCheckInterval(trip, trip.lastUpdateAt)).toEqual({ interval: minutes(10), reasons: [] });
  });

  it('episódios leves não recomendam parada', () => {
    const { effects } = simulate(config('truck'), [driving(minutes(31))], () => seconds(20));
    expect(ofType(effects, 'stopRecommended')).toEqual([]);
  });
});

describe('RNF05 - próximo horário de disparo', () => {
  it('com o veículo em movimento, aponta o horário da próxima verificação', () => {
    const { trip } = simulate(config('truck'), [driving(minutes(4))], alwaysQuick);
    expect(nextTripDeadline(trip)).toBe(MORNING + minutes(10));
  });

  it('com uma verificação ativa, aponta a próxima etapa do alerta', () => {
    const { trip, effects } = simulate(config('truck'), [driving(minutes(10) + seconds(5))], neverResponds);
    const checkAt = ofType(effects, 'checkStarted')[0]?.at ?? 0;
    expect(nextTripDeadline(trip)).toBe(checkAt + seconds(15));
  });

  it('na etapa máxima não há próximo disparo, o alerta é contínuo', () => {
    const { trip } = simulate(config('truck'), [driving(minutes(11))], neverResponds);
    expect(nextTripDeadline(trip)).toBeNull();
  });

  it('com o veículo parado, não há verificação prevista', () => {
    const { trip } = simulate(config('truck'), [driving(minutes(3)), stopped(minutes(1))], alwaysQuick);
    expect(nextTripDeadline(trip)).toBeNull();
  });

  it('o passar do tempo sem nova amostra de velocidade dispara a verificação e as etapas no horário', () => {
    let trip = simulate(config('truck'), [driving(minutes(1))], neverResponds).trip;
    const checkUpdate = advanceTripTime(trip, MORNING + minutes(10));
    expect(ofType(checkUpdate.effects, 'checkStarted').map((effect) => effect.at)).toEqual([MORNING + minutes(10)]);
    trip = checkUpdate.trip;
    const stageUpdate = advanceTripTime(trip, MORNING + minutes(10) + seconds(15));
    expect(stageUpdate.effects).toEqual([
      { type: 'stageEntered', at: MORNING + minutes(10) + seconds(15), stage: 'preventive' },
    ]);
  });
});

describe('Entradas fora de ordem ou sem efeito', () => {
  it('ignora amostra e passagem de tempo anteriores à última atualização', () => {
    const { trip } = simulate(config('car'), [driving(minutes(2))], alwaysQuick);
    expect(processTripSpeedSample(trip, { at: MORNING, speedKmh: 0 })).toEqual({ trip, effects: [] });
    expect(advanceTripTime(trip, MORNING)).toEqual({ trip, effects: [] });
  });

  it('resposta sem verificação ativa não tem efeito', () => {
    const trip = startTrip(config('car'));
    expect(respondToCheck(trip, MORNING + seconds(1))).toEqual({ trip, effects: [] });
  });

  it('resposta repetida depois de encerrada não tem efeito', () => {
    const { trip } = simulate(config('car'), [driving(minutes(15) + seconds(10))], alwaysQuick);
    expect(isCheckActive(trip)).toBe(false);
    expect(respondToCheck(trip, trip.lastUpdateAt)).toEqual({ trip, effects: [] });
  });

  it('resposta com horário anterior à verificação não tem efeito', () => {
    const { trip, effects } = simulate(config('truck'), [driving(minutes(10) + seconds(2))], neverResponds);
    const checkAt = ofType(effects, 'checkStarted')[0]?.at ?? 0;
    expect(respondToCheck(trip, checkAt - 1)).toEqual({ trip, effects: [] });
  });

  it('resposta tardia registra as etapas vencidas antes do encerramento', () => {
    const { trip, effects } = simulate(config('truck'), [driving(minutes(10) + seconds(1))], neverResponds);
    const checkAt = ofType(effects, 'checkStarted')[0]?.at ?? 0;
    const update = respondToCheck(trip, checkAt + seconds(20));
    expect(update.effects.map((effect) => effect.type)).toEqual(['stageEntered', 'checkResolved']);
  });
});

describe('RF09 e RF10 - canais de alerta durante a viagem', () => {
  it('permite desligar a vibração e mantém o som', () => {
    const result = changeTripChannel(startTrip(config('car')), 'vibration', false);
    expect(result.ok && result.trip.channels.vibrationEnabled).toBe(false);
  });

  it('recusa deixar só o canal visual', () => {
    const withoutSound = changeTripChannel(startTrip(config('car')), 'sound', false);
    if (!withoutSound.ok) {
      throw new Error('Mudança inesperadamente recusada');
    }
    expect(changeTripChannel(withoutSound.trip, 'vibration', false)).toEqual({
      ok: false,
      error: 'visualOnlyNotAllowed',
    });
  });

  it('silencia e reativa com a mesma ação', () => {
    const trip = startTrip(config('car'));
    const silenced = toggleTripSilence(trip);
    if (!silenced.ok) {
      throw new Error('Silêncio inesperadamente recusado');
    }
    expect(silenced.trip.channels.silenced).toBe(true);
    expect(toggleTripSilence(silenced.trip)).toEqual({ ok: true, trip });
  });
});
