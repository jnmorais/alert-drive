import { describe, expect, it, jest } from '@jest/globals';

import { minutes, seconds } from '../core/duration';
import { getDefaultSettings } from '../core/profiles';
import type { TripEffect } from '../core/trip';
import type { Clock } from '../core/types';
import type { TouchResponseProvider } from '../services/response/touchResponse';
import { deviceUtcOffsetMinutes } from '../services/timeZone';
import {
  browserTimers,
  createTripController,
  type StartTripParams,
  type TimerScheduler,
  type TripController,
} from './tripController';

const START = Date.UTC(2026, 9, 24, 12, 0, 0);
const BRASILIA_OFFSET = -180;

interface PendingTimer {
  dueAt: number;
  callback: () => void;
  cancelled: boolean;
}

function createTestEnvironment(options: { ignoreCancel?: boolean } = {}) {
  let now = START;
  const pending: PendingTimer[] = [];
  const scheduledDelays: number[] = [];
  const clock: Clock = { now: () => now };
  const timers: TimerScheduler = {
    schedule(callback, delay) {
      scheduledDelays.push(delay);
      const timer = { dueAt: now + delay, callback, cancelled: false };
      pending.push(timer);
      return () => {
        if (!options.ignoreCancel) {
          timer.cancelled = true;
        }
      };
    },
  };

  function advanceBy(duration: number): void {
    const target = now + duration;
    for (;;) {
      const next = pending
        .filter((timer) => !timer.cancelled && timer.dueAt <= target)
        .sort((a, b) => a.dueAt - b.dueAt)[0];
      if (!next) {
        break;
      }
      next.cancelled = true;
      now = Math.max(now, next.dueAt);
      next.callback();
    }
    now = target;
  }

  function setNow(value: number): void {
    now = value;
  }

  return { clock, timers, advanceBy, setNow, scheduledDelays, pending };
}

function startParams(clock: Clock, overrides: Partial<StartTripParams> = {}): StartTripParams {
  return {
    vehicleType: 'truck',
    settings: getDefaultSettings('truck'),
    utcOffsetMinutes: BRASILIA_OFFSET,
    clock,
    simulationMode: true,
    ...overrides,
  };
}

function driveFor(controller: TripController, env: ReturnType<typeof createTestEnvironment>, duration: number) {
  const end = env.clock.now() + duration;
  while (env.clock.now() < end) {
    controller.pushSpeedSample(80);
    env.advanceBy(Math.min(seconds(1), end - env.clock.now()));
  }
  controller.pushSpeedSample(80);
}

function effectTypes(effects: TripEffect[]): string[] {
  return effects.map((effect) => effect.type);
}

describe('Estado global da viagem - início e fim', () => {
  it('começa sem viagem', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers });
    expect(controller.getSnapshot()).toEqual({ trip: null, simulationMode: false, effects: [], completedTrips: [] });
    expect(controller.responseContext()).toBeNull();
  });

  it('inicia a viagem no horário do relógio informado, com o perfil escolhido', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers });
    controller.start(startParams(env.clock));
    const { trip, simulationMode } = controller.getSnapshot();
    expect(trip?.config).toMatchObject({ vehicleType: 'truck', startedAt: START, utcOffsetMinutes: BRASILIA_OFFSET });
    expect(simulationMode).toBe(true);
  });

  it('ao encerrar, guarda a viagem concluída com os efeitos', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers });
    controller.start(startParams(env.clock));
    driveFor(controller, env, minutes(11));
    controller.end();
    const snapshot = controller.getSnapshot();
    expect(snapshot.trip).toBeNull();
    expect(snapshot.completedTrips).toHaveLength(1);
    expect(snapshot.completedTrips[0]).toMatchObject({ simulationMode: true, endedAt: env.clock.now() });
    expect(effectTypes(snapshot.completedTrips[0]?.effects ?? [])).toContain('checkStarted');
  });

  it('iniciar outra viagem encerra a anterior e volta os canais ao padrão (RF10)', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers });
    controller.start(startParams(env.clock));
    controller.toggleSilence();
    controller.start(startParams(env.clock, { vehicleType: 'car', settings: getDefaultSettings('car') }));
    const snapshot = controller.getSnapshot();
    expect(snapshot.completedTrips).toHaveLength(1);
    expect(snapshot.trip?.channels.silenced).toBe(false);
  });

  it('encerrar sem viagem não faz nada', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers });
    controller.end();
    expect(controller.getSnapshot().completedTrips).toEqual([]);
  });

  it('sem viagem, amostras, respostas e canais são ignorados', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers });
    controller.pushSpeedSample(80);
    controller.respond();
    expect(controller.setChannel('sound', false)).toBeNull();
    expect(controller.toggleSilence()).toBeNull();
    controller.reschedule();
    expect(controller.getSnapshot().trip).toBeNull();
    expect(controller.responseProvider('touch')).toBeUndefined();
  });
});

describe('Estado global da viagem - avisos para a tela e os serviços', () => {
  it('avisa os assinantes a cada mudança e permite cancelar a assinatura', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers });
    const listener = jest.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.start(startParams(env.clock));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    controller.pushSpeedSample(80);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('entrega só os efeitos novos aos serviços', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers });
    const received: string[][] = [];
    const unsubscribe = controller.subscribeEffects((effects) => received.push(effectTypes(effects)));
    controller.start(startParams(env.clock));
    driveFor(controller, env, minutes(10) + seconds(16));
    expect(received).toEqual([['checkStarted'], ['stageEntered']]);
    unsubscribe();
    env.advanceBy(seconds(20));
    expect(received).toHaveLength(2);
  });
});

describe('RNF05 - disparos agendados no horário exato', () => {
  it('agenda a próxima verificação e cada etapa do alerta no horário previsto', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers });
    const stages: [string, number][] = [];
    controller.subscribeEffects((effects) =>
      effects.forEach((effect) => {
        if (effect.type === 'stageEntered') {
          stages.push([effect.stage, effect.at - START]);
        }
      }),
    );
    controller.start(startParams(env.clock));
    controller.pushSpeedSample(80);
    env.advanceBy(seconds(1));
    controller.pushSpeedSample(80);
    env.advanceBy(minutes(11));
    expect(stages).toEqual([
      ['preventive', minutes(10) + seconds(15)],
      ['mandatory', minutes(10) + seconds(30)],
      ['maximum', minutes(10) + seconds(45)],
    ]);
  });

  it('na simulação acelerada, converte o atraso simulado em atraso real', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers });
    controller.start(startParams(env.clock, { toRealDelay: (delay) => delay / 60 }));
    controller.pushSpeedSample(80);
    env.advanceBy(seconds(1));
    controller.pushSpeedSample(80);
    expect(env.scheduledDelays[env.scheduledDelays.length - 1]).toBeCloseTo((minutes(10) - seconds(1)) / 60);
  });

  it('com o relógio pausado (atraso infinito), não agenda disparo', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers });
    controller.start(startParams(env.clock, { toRealDelay: () => Number.POSITIVE_INFINITY }));
    controller.pushSpeedSample(80);
    env.advanceBy(seconds(1));
    controller.pushSpeedSample(80);
    expect(env.scheduledDelays).toEqual([]);
  });

  it('se o temporizador disparar antes do horário, reagenda o restante', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers });
    controller.start(startParams(env.clock));
    controller.pushSpeedSample(80);
    env.advanceBy(seconds(1));
    controller.pushSpeedSample(80);
    const early = env.pending[env.pending.length - 1];
    early?.callback();
    expect(env.scheduledDelays[env.scheduledDelays.length - 1]).toBe(minutes(10) - seconds(1));
    expect(controller.getSnapshot().effects).toEqual([]);
  });

  it('um temporizador antigo que dispare depois do fim da viagem é ignorado', () => {
    const env = createTestEnvironment({ ignoreCancel: true });
    const controller = createTripController({ timers: env.timers });
    controller.start(startParams(env.clock));
    controller.pushSpeedSample(80);
    env.advanceBy(seconds(1));
    controller.pushSpeedSample(80);
    controller.end();
    env.advanceBy(minutes(20));
    expect(controller.getSnapshot().trip).toBeNull();
  });

  it('reagendar com a viagem parada não cria disparo', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers });
    controller.start(startParams(env.clock));
    controller.reschedule();
    expect(env.scheduledDelays).toEqual([]);
  });
});

describe('RF06 - resposta durante a verificação', () => {
  it('escuta o toque só enquanto há verificação ativa', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers });
    controller.start(startParams(env.clock));
    const touch = controller.responseProvider('touch');
    expect(touch?.isListening()).toBe(false);
    driveFor(controller, env, minutes(10) + seconds(2));
    expect(touch?.isListening()).toBe(true);
    controller.respond();
    expect(touch?.isListening()).toBe(false);
  });

  it('o toque na tela encerra a verificação e registra a resposta', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers });
    controller.start(startParams(env.clock));
    driveFor(controller, env, minutes(10) + seconds(20));
    const touch = controller.responseProvider('touch') as TouchResponseProvider;
    const context = controller.responseContext();
    expect(context).toEqual({ movement: 'moving', simulationMode: true });
    expect(touch.press(context ?? { movement: 'moving', simulationMode: true })).toEqual({ accepted: true });
    const resolved = controller.getSnapshot().effects.filter((effect) => effect.type === 'checkResolved');
    expect(resolved).toHaveLength(1);
  });

  it('fora da simulação, o toque com o veículo em movimento é recusado', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers });
    controller.start(startParams(env.clock, { simulationMode: false }));
    driveFor(controller, env, minutes(10) + seconds(2));
    const touch = controller.responseProvider('touch') as TouchResponseProvider;
    const context = controller.responseContext() ?? { movement: 'moving', simulationMode: false };
    expect(touch.press(context)).toEqual({ accepted: false, reason: 'vehicleMoving' });
  });

  it('aceita formas de resposta personalizadas', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers, createResponseProviders: () => [] });
    controller.start(startParams(env.clock));
    expect(controller.responseProvider('touch')).toBeUndefined();
  });
});

describe('RF09 e RF10 - canais durante a viagem', () => {
  it('muda um canal e informa a recusa de deixar só o visual', () => {
    const env = createTestEnvironment();
    const controller = createTripController({ timers: env.timers });
    controller.start(startParams(env.clock));
    expect(controller.setChannel('vibration', false)).toBeNull();
    expect(controller.getSnapshot().trip?.channels.vibrationEnabled).toBe(false);
    expect(controller.setChannel('sound', false)).toBe('visualOnlyNotAllowed');
    expect(controller.toggleSilence()).toBe('visualOnlyNotAllowed');
    expect(controller.getSnapshot().trip?.channels.soundEnabled).toBe(true);
  });
});

describe('Serviços auxiliares do estado', () => {
  it('lê o fuso do aparelho em minutos', () => {
    const offset = deviceUtcOffsetMinutes({ now: () => START });
    expect(offset).toBe(-new Date(START).getTimezoneOffset());
  });

  it('o agendador do navegador dispara e pode ser cancelado', () => {
    jest.useFakeTimers();
    const fired = jest.fn();
    const cancelled = jest.fn();
    browserTimers.schedule(fired, 100);
    const cancel = browserTimers.schedule(cancelled, 100);
    cancel();
    jest.advanceTimersByTime(100);
    expect(fired).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
