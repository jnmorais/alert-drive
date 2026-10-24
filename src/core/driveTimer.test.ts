import { describe, expect, it } from '@jest/globals';

import {
  classifyMovement,
  createDriveTimer,
  type DriveTimerEvent,
  type DriveTimerSettings,
  type DriveTimerState,
  isBreakOverdue,
  processSpeedSample,
  type SpeedSample,
} from './driveTimer';
import { hours, minutes, seconds } from './duration';
import { getDefaultSettings } from './profiles';

const TRIP_START = Date.UTC(2026, 9, 24, 8, 0, 0);
const SAMPLE_STEP = minutes(1);
const CRUISING_KMH = 80;
const STOPPED_KMH = 0;

const truck = getDefaultSettings('truck');
const car = getDefaultSettings('car');

interface Segment {
  duration: number;
  speedKmh: number;
}

function buildSamples(segments: Segment[], step = SAMPLE_STEP): SpeedSample[] {
  const samples: SpeedSample[] = [];
  let segmentStart = TRIP_START;
  let lastSpeed = STOPPED_KMH;
  for (const segment of segments) {
    const segmentEnd = segmentStart + segment.duration;
    for (let at = segmentStart; at < segmentEnd; at += step) {
      samples.push({ at, speedKmh: segment.speedKmh });
    }
    segmentStart = segmentEnd;
    lastSpeed = segment.speedKmh;
  }
  samples.push({ at: segmentStart, speedKmh: lastSpeed });
  return samples;
}

function run(
  samples: SpeedSample[],
  settings: DriveTimerSettings,
  initial: DriveTimerState = createDriveTimer(),
): { state: DriveTimerState; events: DriveTimerEvent[] } {
  let state = initial;
  const events: DriveTimerEvent[] = [];
  for (const sample of samples) {
    const update = processSpeedSample(state, sample, settings);
    state = update.state;
    events.push(...update.events);
  }
  return { state, events };
}

function driving(duration: number): Segment {
  return { duration, speedKmh: CRUISING_KMH };
}

function stopped(duration: number): Segment {
  return { duration, speedKmh: STOPPED_KMH };
}

describe('RF03 - estado de movimento com histerese', () => {
  it('fica em movimento só acima de 10 km/h', () => {
    expect(classifyMovement('stopped', 10)).toBe('stopped');
    expect(classifyMovement('stopped', 10.1)).toBe('moving');
  });

  it('fica parado só abaixo de 5 km/h', () => {
    expect(classifyMovement('moving', 5)).toBe('moving');
    expect(classifyMovement('moving', 4.9)).toBe('stopped');
  });

  it('mantém o estado anterior entre 5 e 10 km/h', () => {
    expect(classifyMovement('moving', 7)).toBe('moving');
    expect(classifyMovement('stopped', 7)).toBe('stopped');
  });

  it('ignora velocidade inválida do GPS e mantém o estado anterior', () => {
    expect(classifyMovement('moving', -1)).toBe('moving');
    expect(classifyMovement('stopped', Number.NaN)).toBe('stopped');
    expect(classifyMovement('moving', Number.POSITIVE_INFINITY)).toBe('moving');
  });

  it('começa a viagem parado e sem tempo de direção', () => {
    expect(createDriveTimer()).toMatchObject({ movement: 'stopped', accumulatedDriving: 0 });
  });
});

describe('RF03 - tempo de direção acumulado', () => {
  it('acumula o tempo apenas em movimento', () => {
    const { state } = run(buildSamples([driving(minutes(40))]), truck);
    expect(state.accumulatedDriving).toBe(minutes(40));
  });

  it('não acumula tempo parado antes de sair', () => {
    const { state } = run(buildSamples([stopped(minutes(10)), driving(minutes(20))]), truck);
    expect(state.accumulatedDriving).toBe(minutes(20));
  });

  it('não registra pausa pela espera antes de sair', () => {
    const { events } = run(buildSamples([stopped(hours(1)), driving(minutes(5))]), truck);
    expect(events).toEqual([]);
  });

  it('não acumula durante a oscilação de ruído entre 5 e 10 km/h quando estava parado', () => {
    const samples = buildSamples([driving(minutes(10)), stopped(minutes(5)), { duration: minutes(5), speedKmh: 8 }]);
    const { state } = run(samples, truck);
    expect(state.accumulatedDriving).toBe(minutes(10));
  });

  it('continua acumulando na faixa de 5 a 10 km/h quando estava em movimento', () => {
    const samples = buildSamples([driving(minutes(10)), { duration: minutes(5), speedKmh: 8 }]);
    const { state } = run(samples, truck);
    expect(state.accumulatedDriving).toBe(minutes(15));
  });

  it('ignora amostra com horário anterior à última recebida', () => {
    const { state } = run(buildSamples([driving(minutes(10))]), truck);
    const update = processSpeedSample(state, { at: TRIP_START, speedKmh: STOPPED_KMH }, truck);
    expect(update).toEqual({ state, events: [] });
  });
});

describe('RF03 - reconhecimento de pausa', () => {
  it('parada curta não zera nem acumula o tempo de direção', () => {
    const samples = buildSamples([driving(hours(1)), stopped(minutes(29)), driving(minutes(30))]);
    const { state, events } = run(samples, truck);
    expect(state.accumulatedDriving).toBe(hours(1.5));
    expect(events.filter((event) => event.type === 'breakRegistered')).toEqual([]);
  });

  it('parada igual à pausa mínima zera o tempo e registra a pausa', () => {
    const samples = buildSamples([driving(hours(1)), stopped(minutes(30))]);
    const { state, events } = run(samples, truck);
    const stopStartedAt = TRIP_START + hours(1);
    expect(state.accumulatedDriving).toBe(0);
    expect(events).toEqual([
      { type: 'breakRegistered', at: stopStartedAt + minutes(30), stoppedSince: stopStartedAt },
    ]);
  });

  it('registra uma única pausa por parada, mesmo que ela se prolongue', () => {
    const samples = buildSamples([driving(hours(1)), stopped(hours(2))]);
    const { events } = run(samples, truck);
    expect(events.filter((event) => event.type === 'breakRegistered')).toHaveLength(1);
  });

  it('volta a acumular do zero depois da pausa', () => {
    const samples = buildSamples([driving(hours(2)), stopped(minutes(30)), driving(minutes(45))]);
    const { state } = run(samples, truck);
    expect(state.accumulatedDriving).toBe(minutes(45));
  });

  it.each([
    ['automóvel com 15 minutos', car, minutes(15), 0],
    ['caminhão com 15 minutos', truck, minutes(15), hours(1)],
  ] as const)('usa a pausa mínima do perfil: %s', (_label, settings, stopDuration, expected) => {
    const samples = buildSamples([driving(hours(1)), stopped(stopDuration)]);
    expect(run(samples, settings).state.accumulatedDriving).toBe(expected);
  });

  it('reconhece a pausa mesmo sem amostras durante a parada', () => {
    const samples: SpeedSample[] = [
      { at: TRIP_START, speedKmh: CRUISING_KMH },
      { at: TRIP_START + hours(1), speedKmh: STOPPED_KMH },
      { at: TRIP_START + hours(1) + minutes(40), speedKmh: CRUISING_KMH },
    ];
    const { state, events } = run(samples, truck);
    expect(state.accumulatedDriving).toBe(0);
    expect(events).toEqual([
      {
        type: 'breakRegistered',
        at: TRIP_START + hours(1) + minutes(30),
        stoppedSince: TRIP_START + hours(1),
      },
    ]);
  });
});

describe('RF04 - pré-aviso e lembrete de pausa', () => {
  it.each([
    ['caminhão', 'truck', hours(5), hours(5.5)],
    ['ônibus', 'bus', hours(3.5), hours(4)],
    ['automóvel', 'car', hours(1.75), hours(2)],
  ] as const)(
    'perfil %s emite o pré-aviso e o lembrete no tempo exato do Quadro 2',
    (_label, vehicleType, preWarningAt, reminderAt) => {
      const settings = getDefaultSettings(vehicleType);
      const { events } = run(buildSamples([driving(hours(6))], seconds(45)), settings);
      expect(events).toEqual([
        { type: 'breakPreWarning', at: TRIP_START + preWarningAt },
        { type: 'breakReminder', at: TRIP_START + reminderAt },
      ]);
    },
  );

  it('emite cada aviso uma única vez por ciclo', () => {
    const { events } = run(buildSamples([driving(hours(8))]), car);
    expect(events.map((event) => event.type)).toEqual(['breakPreWarning', 'breakReminder']);
  });

  it('emite os dois avisos quando uma única amostra ultrapassa os dois limites', () => {
    const samples: SpeedSample[] = [
      { at: TRIP_START, speedKmh: CRUISING_KMH },
      { at: TRIP_START + hours(3), speedKmh: CRUISING_KMH },
    ];
    expect(run(samples, car).events).toEqual([
      { type: 'breakPreWarning', at: TRIP_START + hours(1.75) },
      { type: 'breakReminder', at: TRIP_START + hours(2) },
    ]);
  });

  it('não emite aviso durante paradas', () => {
    const samples = buildSamples([driving(hours(1.5)), stopped(minutes(14)), driving(minutes(10))]);
    const { events } = run(samples, car);
    expect(events).toEqual([]);
  });

  it('emite os avisos de novo no ciclo seguinte à pausa', () => {
    const samples = buildSamples([driving(hours(2)), stopped(minutes(15)), driving(hours(2))]);
    const types = run(samples, car).events.map((event) => event.type);
    expect(types).toEqual([
      'breakPreWarning',
      'breakReminder',
      'breakRegistered',
      'breakPreWarning',
      'breakReminder',
    ]);
  });

  it('avisa assim que possível se o lembrete for reduzido no meio do ciclo', () => {
    const { state } = run(buildSamples([driving(hours(1))]), car);
    const reduced: DriveTimerSettings = { ...car, breakReminderAfter: minutes(50) };
    const next = processSpeedSample(state, { at: TRIP_START + hours(1) + minutes(1), speedKmh: CRUISING_KMH }, reduced);
    expect(next.events).toEqual([
      { type: 'breakPreWarning', at: TRIP_START + hours(1) },
      { type: 'breakReminder', at: TRIP_START + hours(1) },
    ]);
  });
});

describe('RF04 - estado de pausa vencida', () => {
  it('não está vencida antes do lembrete', () => {
    expect(isBreakOverdue(run(buildSamples([driving(hours(1.9))]), car).state)).toBe(false);
  });

  it('fica vencida depois do lembrete', () => {
    expect(isBreakOverdue(run(buildSamples([driving(hours(2))]), car).state)).toBe(true);
  });

  it('continua vencida após uma parada curta demais', () => {
    const samples = buildSamples([driving(hours(2)), stopped(minutes(10)), driving(minutes(5))]);
    expect(isBreakOverdue(run(samples, car).state)).toBe(true);
  });

  it('deixa de estar vencida quando uma pausa é registrada', () => {
    const samples = buildSamples([driving(hours(2)), stopped(minutes(15))]);
    expect(isBreakOverdue(run(samples, car).state)).toBe(false);
  });
});
