import { describe, expect, it } from '@jest/globals';

import {
  type CheckIntervalContext,
  type CheckSchedulerState,
  createCheckScheduler,
  isNightTime,
  localHourAt,
  markCheckResolved,
  processScheduleTick,
  type ScheduledCheck,
  selectCheckInterval,
} from './checkScheduler';
import type { MovementState } from './driveTimer';
import { hours, minutes, seconds } from './duration';
import { customizeSettings, getDefaultSettings, type ProfileSettings } from './profiles';

const DAY = Date.UTC(2026, 9, 24);
const UTC = 0;
const TICK_STEP = seconds(30);
const RESPONSE_DELAY = seconds(5);

const truck = getDefaultSettings('truck');
const car = getDefaultSettings('car');

interface Segment {
  duration: number;
  movement: MovementState;
  breakOverdue?: boolean;
}

interface TripOptions {
  startAt: number;
  segments: Segment[];
  settings: ProfileSettings;
  respond?: boolean;
}

function contextAt(at: number, breakOverdue: boolean): CheckIntervalContext {
  return { localHour: localHourAt(at, UTC), breakOverdue, recurrentEpisodesReduction: false };
}

function runTrip({ startAt, segments, settings, respond = true }: TripOptions): ScheduledCheck[] {
  let state: CheckSchedulerState = createCheckScheduler();
  const checks: ScheduledCheck[] = [];
  let pendingResolutionAt: number | null = null;
  let segmentStart = startAt;

  for (const segment of segments) {
    const segmentEnd = segmentStart + segment.duration;
    for (let at = segmentStart; at < segmentEnd; at += TICK_STEP) {
      if (pendingResolutionAt !== null && at >= pendingResolutionAt) {
        state = markCheckResolved(state, pendingResolutionAt);
        pendingResolutionAt = null;
      }
      const update = processScheduleTick(
        state,
        { at, movement: segment.movement, context: contextAt(at, segment.breakOverdue ?? false) },
        settings,
      );
      state = update.state;
      if (update.check) {
        checks.push(update.check);
        pendingResolutionAt = respond ? update.check.at + RESPONSE_DELAY : null;
      }
    }
    segmentStart = segmentEnd;
  }
  return checks;
}

function moving(duration: number, breakOverdue = false): Segment {
  return { duration, movement: 'moving', breakOverdue };
}

function stopped(duration: number, breakOverdue = false): Segment {
  return { duration, movement: 'stopped', breakOverdue };
}

function checkTimes(checks: ScheduledCheck[], origin: number): number[] {
  return checks.map((check) => check.at - origin);
}

const daytimeContext: CheckIntervalContext = {
  localHour: 10,
  breakOverdue: false,
  recurrentEpisodesReduction: false,
};

describe('RF05 - modo noturno das 00h às 06h', () => {
  it.each([
    [0, true],
    [3, true],
    [5, true],
    [6, false],
    [12, false],
    [23, false],
  ])('hora local %i é noturna: %s', (localHour, expected) => {
    expect(isNightTime(localHour)).toBe(expected);
  });

  it('calcula a hora local a partir do fuso em minutos', () => {
    expect(localHourAt(DAY + hours(2), -180)).toBe(23);
    expect(localHourAt(DAY + hours(8) + minutes(59), -180)).toBe(5);
    expect(localHourAt(DAY + hours(9), -180)).toBe(6);
    expect(localHourAt(DAY + hours(23), 120)).toBe(1);
    expect(localHourAt(DAY + hours(14), UTC)).toBe(14);
  });
});

describe('RF05 - escolha do intervalo de verificação', () => {
  it.each([
    ['caminhão', truck, minutes(10)],
    ['ônibus', getDefaultSettings('bus'), minutes(10)],
    ['automóvel', car, minutes(15)],
  ] as const)('perfil %s usa o intervalo diurno do Quadro 2', (_label, settings, expected) => {
    expect(selectCheckInterval(settings, daytimeContext)).toEqual({ interval: expected, reasons: [] });
  });

  it('usa o intervalo diurno configurado pelo usuário', () => {
    const result = customizeSettings('car', { daytimeCheckInterval: minutes(12) });
    if (!result.ok) {
      throw new Error('Configuração inválida no teste');
    }
    expect(selectCheckInterval(result.settings, daytimeContext).interval).toBe(minutes(12));
  });

  it('reduz para 5 minutos de madrugada', () => {
    expect(selectCheckInterval(car, { ...daytimeContext, localHour: 2 })).toEqual({
      interval: minutes(5),
      reasons: ['night'],
    });
  });

  it('reduz para 5 minutos com a pausa vencida', () => {
    expect(selectCheckInterval(truck, { ...daytimeContext, breakOverdue: true })).toEqual({
      interval: minutes(5),
      reasons: ['breakOverdue'],
    });
  });

  it('reduz para 5 minutos por episódios recorrentes', () => {
    expect(
      selectCheckInterval(truck, { ...daytimeContext, recurrentEpisodesReduction: true }),
    ).toEqual({ interval: minutes(5), reasons: ['recurrentEpisodes'] });
  });

  it('informa todos os motivos da redução', () => {
    expect(
      selectCheckInterval(car, {
        localHour: 1,
        breakOverdue: true,
        recurrentEpisodesReduction: true,
      }),
    ).toEqual({ interval: minutes(5), reasons: ['night', 'breakOverdue', 'recurrentEpisodes'] });
  });
});

describe('RF05 - verificações periódicas', () => {
  it('automóvel em viagem diurna é verificado a cada 15 minutos', () => {
    const start = DAY + hours(9);
    const checks = runTrip({ startAt: start, segments: [moving(hours(1) + minutes(1))], settings: car });
    expect(checkTimes(checks, start)).toEqual([
      minutes(15),
      minutes(30) + RESPONSE_DELAY,
      minutes(45) + RESPONSE_DELAY * 2,
      minutes(60) + RESPONSE_DELAY * 3,
    ]);
    expect(checks.every((check) => check.interval === minutes(15))).toBe(true);
  });

  it('caminhão em viagem diurna é verificado a cada 10 minutos', () => {
    const start = DAY + hours(9);
    const checks = runTrip({ startAt: start, segments: [moving(minutes(31))], settings: truck });
    expect(checkTimes(checks, start)).toEqual([
      minutes(10),
      minutes(20) + RESPONSE_DELAY,
      minutes(30) + RESPONSE_DELAY * 2,
    ]);
  });

  it('a primeira leitura nunca dispara verificação', () => {
    const update = processScheduleTick(
      createCheckScheduler(),
      { at: DAY, movement: 'moving', context: daytimeContext },
      car,
    );
    expect(update.check).toBeNull();
  });

  it('não emite nova verificação enquanto a anterior não termina', () => {
    const start = DAY + hours(9);
    const checks = runTrip({
      startAt: start,
      segments: [moving(minutes(45))],
      settings: truck,
      respond: false,
    });
    expect(checkTimes(checks, start)).toEqual([minutes(10)]);
  });

  it('recomeça a contagem quando a verificação termina', () => {
    let state = createCheckScheduler();
    const start = DAY + hours(9);
    for (let at = start; at <= start + minutes(10); at += TICK_STEP) {
      state = processScheduleTick(state, { at, movement: 'moving', context: daytimeContext }, truck).state;
    }
    expect(state.phase).toBe('awaitingResponse');
    const resolvedAt = start + minutes(25);
    state = markCheckResolved(state, resolvedAt);
    expect(state).toMatchObject({ phase: 'counting', movingSinceLastCheck: 0, lastTickAt: resolvedAt });
  });

  it('marcar como resolvida antes de qualquer leitura usa o horário informado', () => {
    expect(markCheckResolved(createCheckScheduler(), DAY).lastTickAt).toBe(DAY);
  });

  it('conta o tempo em movimento entre a resposta e a última leitura já processada', () => {
    const awaiting: CheckSchedulerState = {
      phase: 'awaitingResponse',
      movement: 'moving',
      lastTickAt: DAY + minutes(10) + seconds(30),
      movingSinceLastCheck: 0,
    };
    expect(markCheckResolved(awaiting, DAY + minutes(10) + seconds(10))).toEqual({
      ...awaiting,
      phase: 'counting',
      movingSinceLastCheck: seconds(20),
    });
  });

  it('não conta tempo entre a resposta e a última leitura se o veículo estava parado', () => {
    const awaiting: CheckSchedulerState = {
      phase: 'awaitingResponse',
      movement: 'stopped',
      lastTickAt: DAY + minutes(10) + seconds(30),
      movingSinceLastCheck: 0,
    };
    expect(markCheckResolved(awaiting, DAY + minutes(10)).movingSinceLastCheck).toBe(0);
  });

  it('ignora leitura com horário anterior à última', () => {
    const first = processScheduleTick(
      createCheckScheduler(),
      { at: DAY + minutes(1), movement: 'moving', context: daytimeContext },
      truck,
    );
    const update = processScheduleTick(
      first.state,
      { at: DAY, movement: 'moving', context: daytimeContext },
      truck,
    );
    expect(update).toEqual({ state: first.state, check: null });
  });
});

describe('RF05 - verificações só com o veículo em movimento', () => {
  it('não verifica durante uma parada longa', () => {
    const start = DAY + hours(9);
    const checks = runTrip({ startAt: start, segments: [stopped(hours(1))], settings: truck });
    expect(checks).toEqual([]);
  });

  it('pausa a contagem durante a parada e retoma ao andar', () => {
    const start = DAY + hours(9);
    const checks = runTrip({
      startAt: start,
      segments: [moving(minutes(8)), stopped(minutes(20)), moving(minutes(5))],
      settings: truck,
    });
    expect(checkTimes(checks, start)).toEqual([minutes(30)]);
  });

  it('se a verificação vence com o veículo parado, ela sai na primeira leitura em movimento', () => {
    const start = DAY + hours(9);
    const checks = runTrip({
      startAt: start,
      segments: [moving(minutes(8)), stopped(minutes(3), true), moving(minutes(2), true)],
      settings: truck,
    });
    expect(checkTimes(checks, start)).toEqual([minutes(11)]);
    expect(checks[0]?.reasons).toEqual(['breakOverdue']);
  });
});

describe('RF05 - intervalo reduzido durante a viagem', () => {
  it('a verificação causada pelo intervalo reduzido nunca tem horário anterior à redução', () => {
    let state = createCheckScheduler();
    const start = DAY + hours(9);
    const reducedAt = start + minutes(8);
    let check: ScheduledCheck | null = null;
    for (let at = start; at <= reducedAt && check === null; at += seconds(1)) {
      const breakOverdue = at >= reducedAt;
      const update = processScheduleTick(
        state,
        { at, movement: 'moving', context: { ...daytimeContext, breakOverdue } },
        truck,
      );
      state = update.state;
      check = update.check;
    }
    expect(check).toEqual({ at: reducedAt, interval: minutes(5), reasons: ['breakOverdue'] });
  });

  it('viagem de madrugada é verificada a cada 5 minutos', () => {
    const start = DAY + hours(1);
    const checks = runTrip({ startAt: start, segments: [moving(minutes(16))], settings: car });
    expect(checkTimes(checks, start)).toEqual([
      minutes(5),
      minutes(10) + RESPONSE_DELAY,
      minutes(15) + RESPONSE_DELAY * 2,
    ]);
    expect(checks.every((check) => check.reasons.includes('night'))).toBe(true);
  });

  it('volta ao intervalo diurno a partir das 06h', () => {
    const start = DAY + hours(5) + minutes(50);
    const checks = runTrip({ startAt: start, segments: [moving(minutes(30))], settings: truck });
    expect(checkTimes(checks, start)).toEqual([
      minutes(5),
      minutes(15) + RESPONSE_DELAY,
      minutes(25) + RESPONSE_DELAY * 2,
    ]);
    expect(checks.map((check) => check.reasons)).toEqual([['night'], [], []]);
  });

  it('com a pausa vencida no meio da contagem, a verificação sai e é registrada no instante em que o intervalo diminui', () => {
    const start = DAY + hours(9);
    const checks = runTrip({
      startAt: start,
      segments: [moving(minutes(7)), moving(minutes(2), true)],
      settings: truck,
    });
    expect(checkTimes(checks, start)).toEqual([minutes(7)]);
    expect(checks[0]).toMatchObject({ interval: minutes(5), reasons: ['breakOverdue'] });
  });
});
