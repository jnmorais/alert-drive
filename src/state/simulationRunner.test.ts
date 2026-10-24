import { describe, expect, it } from '@jest/globals';

import { minutes, seconds } from '../core/duration';
import { getDefaultSettings } from '../core/profiles';
import type { TripEffect } from '../core/trip';
import type { Clock } from '../core/types';
import type { SpeedSegment } from '../simulation/scenarios';
import { createSimulationRunner, SAMPLE_REAL_INTERVAL, type SimulationSetup } from './simulationRunner';
import { createTripController, type TimerScheduler } from './tripController';

const REAL_START = Date.UTC(2026, 9, 24, 15, 0, 0);
const SIMULATED_START = Date.UTC(2026, 9, 24, 12, 0, 0);

interface PendingTimer {
  dueAt: number;
  callback: () => void;
  cancelled: boolean;
}

function createEnvironment() {
  let now = REAL_START;
  let lateness = 0;
  const pending: PendingTimer[] = [];
  const realClock: Clock = { now: () => now };
  const timers: TimerScheduler = {
    schedule(callback, delay) {
      const timer = { dueAt: now + Math.ceil(delay) + lateness, callback, cancelled: false };
      pending.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  };

  function advanceRealTime(duration: number): void {
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

  function setLateness(value: number): void {
    lateness = value;
  }

  function activeTimers(): number {
    return pending.filter((timer) => !timer.cancelled).length;
  }

  const controller = createTripController({ timers });
  const runner = createSimulationRunner({ controller, timers, realClock });
  return { controller, runner, advanceRealTime, activeTimers, setLateness };
}

function setup(segments: SpeedSegment[], overrides: Partial<SimulationSetup> = {}): SimulationSetup {
  return {
    vehicleType: 'car',
    settings: getDefaultSettings('car'),
    segments,
    startAt: SIMULATED_START,
    utcOffsetMinutes: -180,
    speedFactor: 60,
    responder: null,
    ...overrides,
  };
}

function effectsOfType<T extends TripEffect['type']>(effects: TripEffect[], type: T) {
  return effects.filter((effect): effect is Extract<TripEffect, { type: T }> => effect.type === type);
}

const ONE_HOUR_DRIVING: SpeedSegment[] = [{ duration: minutes(60), speedKmh: 80 }];

describe('RF14 - simulação ao vivo com relógio acelerado', () => {
  it('inicia uma viagem em modo simulação no horário escolhido', () => {
    const env = createEnvironment();
    env.runner.start(setup(ONE_HOUR_DRIVING));
    const snapshot = env.controller.getSnapshot();
    expect(snapshot.simulationMode).toBe(true);
    expect(snapshot.trip?.config.startedAt).toBe(SIMULATED_START);
    expect(env.runner.getSnapshot()).toEqual({
      status: 'running',
      elapsed: 0,
      duration: minutes(60),
      speedKmh: 80,
      speedFactor: 60,
    });
  });

  it('com fator 60, 10 segundos reais viram 10 minutos de direção', () => {
    const env = createEnvironment();
    env.runner.start(setup(ONE_HOUR_DRIVING));
    env.advanceRealTime(seconds(10));
    expect(env.runner.getSnapshot().elapsed).toBe(minutes(10));
    expect(env.controller.getSnapshot().trip?.driveTimer.accumulatedDriving).toBe(minutes(10));
  });

  it('lê a velocidade a cada meio segundo real', () => {
    expect(SAMPLE_REAL_INTERVAL).toBe(500);
    const env = createEnvironment();
    env.runner.start(setup(ONE_HOUR_DRIVING));
    env.advanceRealTime(SAMPLE_REAL_INTERVAL);
    expect(env.controller.getSnapshot().trip?.driveTimer.lastSampleAt).toBe(SIMULATED_START + seconds(30));
  });

  it('dispara a verificação no horário simulado exato', () => {
    const env = createEnvironment();
    env.runner.start(setup(ONE_HOUR_DRIVING));
    env.advanceRealTime(seconds(16));
    const checks = effectsOfType(env.controller.getSnapshot().effects, 'checkStarted');
    expect(checks[0]?.at).toBe(SIMULATED_START + minutes(15));
  });

  it('sem resposta, o alerta chega à etapa 3 nos tempos do perfil', () => {
    const env = createEnvironment();
    env.runner.start(setup(ONE_HOUR_DRIVING));
    env.advanceRealTime(seconds(15) + seconds(1));
    const stages = effectsOfType(env.controller.getSnapshot().effects, 'stageEntered');
    expect(stages.map((stage) => stage.at - SIMULATED_START - minutes(15))).toEqual([
      seconds(15),
      seconds(30),
      seconds(45),
    ]);
  });

  it('responde sozinho como no roteiro quando pedido', () => {
    const env = createEnvironment();
    env.runner.start(setup(ONE_HOUR_DRIVING, { responder: () => seconds(5) }));
    env.advanceRealTime(seconds(16));
    const resolved = effectsOfType(env.controller.getSnapshot().effects, 'checkResolved');
    expect(resolved[0]?.outcome.responseTime).toBe(seconds(5));
    expect(resolved[0]?.outcome.maxStage).toBe('check');
  });

  it('passa o número de cada verificação para o roteiro de respostas', () => {
    const env = createEnvironment();
    const asked: number[] = [];
    env.runner.start(
      setup(ONE_HOUR_DRIVING, {
        responder: (index) => {
          asked.push(index);
          return seconds(5);
        },
      }),
    );
    env.advanceRealTime(seconds(31));
    expect(asked).toEqual([0, 1]);
  });

  it('troca de trecho no horário exato do roteiro e registra a pausa', () => {
    const env = createEnvironment();
    env.runner.start(
      setup(
        [
          { duration: minutes(10) + seconds(10), speedKmh: 80 },
          { duration: minutes(20), speedKmh: 0 },
        ],
        { responder: () => seconds(5) },
      ),
    );
    env.advanceRealTime(seconds(31));
    const breaks = effectsOfType(env.controller.getSnapshot().effects, 'breakRegistered');
    expect(breaks[0]?.stoppedSince).toBe(SIMULATED_START + minutes(10) + seconds(10));
  });

  it('no fim do roteiro, para o veículo e mantém a viagem aberta', () => {
    const env = createEnvironment();
    env.runner.start(setup([{ duration: minutes(5), speedKmh: 80 }]));
    env.advanceRealTime(seconds(6));
    expect(env.runner.getSnapshot()).toMatchObject({ status: 'finished', elapsed: minutes(5), speedKmh: 0 });
    const trip = env.controller.getSnapshot().trip;
    expect(trip?.driveTimer.movement).toBe('stopped');
    expect(trip?.driveTimer.accumulatedDriving).toBe(minutes(5));
  });
});

describe('RF14 - leituras no horário planejado mesmo com o temporizador atrasado', () => {
  const DRIVE_STOP_DRIVE: SpeedSegment[] = [
    { duration: minutes(10), speedKmh: 80 },
    { duration: minutes(15), speedKmh: 0 },
    { duration: minutes(10), speedKmh: 80 },
  ];

  it('com todos os disparos atrasados, a troca de trecho fica no horário exato do roteiro', () => {
    const env = createEnvironment();
    env.setLateness(2);
    env.runner.start(setup(DRIVE_STOP_DRIVE, { speedFactor: 300, responder: () => seconds(5) }));
    env.advanceRealTime(seconds(3));
    expect(env.controller.getSnapshot().trip?.driveTimer.stoppedSince).toBe(SIMULATED_START + minutes(10));
  });

  it('uma parada exatamente igual à pausa mínima é registrada mesmo se só o início dela atrasar', () => {
    const env = createEnvironment();
    env.runner.start(setup(DRIVE_STOP_DRIVE, { speedFactor: 300, responder: () => seconds(5) }));
    env.advanceRealTime(1400);
    env.setLateness(2);
    env.advanceRealTime(200);
    env.setLateness(0);
    env.advanceRealTime(seconds(6));
    const breaks = effectsOfType(env.controller.getSnapshot().effects, 'breakRegistered');
    expect(breaks).toHaveLength(1);
    expect(breaks[0]?.stoppedSince).toBe(SIMULATED_START + minutes(10));
  });

  it('não perde a leitura quando um disparo da viagem chega antes dela', () => {
    const env = createEnvironment();
    env.runner.start(setup(ONE_HOUR_DRIVING, { speedFactor: 300 }));
    env.advanceRealTime(2400);
    env.setLateness(2);
    env.advanceRealTime(200);
    env.setLateness(0);
    env.advanceRealTime(500);
    const trip = env.controller.getSnapshot().trip;
    expect(effectsOfType(env.controller.getSnapshot().effects, 'checkStarted')[0]?.at).toBe(SIMULATED_START + minutes(15));
    expect(trip?.driveTimer.lastSampleAt).toBe(SIMULATED_START + minutes(15) + 600);
  });

  it('no fim do roteiro, a parada final fica no horário exato do fim', () => {
    const env = createEnvironment();
    env.setLateness(2);
    env.runner.start(setup([{ duration: minutes(5), speedKmh: 80 }], { speedFactor: 300 }));
    env.advanceRealTime(seconds(3));
    expect(env.controller.getSnapshot().trip?.driveTimer.stoppedSince).toBe(SIMULATED_START + minutes(5));
  });
});

describe('RF14 - pausar, continuar e parar a simulação', () => {
  it('avisa quem acompanha o progresso até cancelar a inscrição', () => {
    const env = createEnvironment();
    let notifications = 0;
    const unsubscribe = env.runner.subscribe(() => {
      notifications += 1;
    });
    env.runner.start(setup(ONE_HOUR_DRIVING));
    const afterStart = notifications;
    expect(afterStart).toBeGreaterThan(0);
    unsubscribe();
    env.advanceRealTime(seconds(5));
    expect(notifications).toBe(afterStart);
  });

  it('pausar congela o relógio simulado e os disparos', () => {
    const env = createEnvironment();
    env.runner.start(setup(ONE_HOUR_DRIVING));
    env.advanceRealTime(seconds(5));
    env.runner.pause();
    env.advanceRealTime(seconds(60));
    expect(env.runner.getSnapshot()).toMatchObject({ status: 'paused', elapsed: minutes(5) });
    expect(env.controller.getSnapshot().effects).toEqual([]);
  });

  it('continuar retoma do ponto em que parou', () => {
    const env = createEnvironment();
    env.runner.start(setup(ONE_HOUR_DRIVING));
    env.advanceRealTime(seconds(5));
    env.runner.pause();
    env.advanceRealTime(seconds(60));
    env.runner.resume();
    env.advanceRealTime(seconds(11));
    expect(env.runner.getSnapshot()).toMatchObject({ status: 'running', elapsed: minutes(16) });
    expect(effectsOfType(env.controller.getSnapshot().effects, 'checkStarted')[0]?.at).toBe(
      SIMULATED_START + minutes(15),
    );
  });

  it('a resposta automática pendente espera a pausa terminar', () => {
    const env = createEnvironment();
    env.runner.start(setup(ONE_HOUR_DRIVING, { responder: () => seconds(30) }));
    env.advanceRealTime(seconds(15) + 100);
    env.runner.pause();
    env.advanceRealTime(seconds(60));
    expect(effectsOfType(env.controller.getSnapshot().effects, 'checkResolved')).toEqual([]);
    env.runner.resume();
    env.advanceRealTime(seconds(1));
    const resolved = effectsOfType(env.controller.getSnapshot().effects, 'checkResolved');
    expect(resolved[0]?.outcome.responseTime).toBe(seconds(30));
  });

  it('pausar e continuar fora de hora não muda nada', () => {
    const env = createEnvironment();
    env.runner.pause();
    env.runner.resume();
    expect(env.runner.getSnapshot().status).toBe('idle');
    env.runner.start(setup(ONE_HOUR_DRIVING));
    env.runner.resume();
    expect(env.runner.getSnapshot().status).toBe('running');
  });

  it('parar encerra a viagem simulada e cancela os disparos', () => {
    const env = createEnvironment();
    env.runner.start(setup(ONE_HOUR_DRIVING));
    env.advanceRealTime(seconds(5));
    env.runner.stop();
    expect(env.runner.getSnapshot().status).toBe('idle');
    expect(env.controller.getSnapshot().trip).toBeNull();
    expect(env.controller.getSnapshot().completedTrips).toHaveLength(1);
    expect(env.activeTimers()).toBe(0);
  });

  it('parar sem simulação em andamento não faz nada', () => {
    const env = createEnvironment();
    env.runner.stop();
    expect(env.runner.getSnapshot().status).toBe('idle');
  });

  it('encerrar a viagem pela tela de viagem também encerra a simulação', () => {
    const env = createEnvironment();
    env.runner.start(setup(ONE_HOUR_DRIVING));
    env.advanceRealTime(seconds(5));
    env.controller.end();
    expect(env.runner.getSnapshot().status).toBe('idle');
    expect(env.activeTimers()).toBe(0);
  });

  it('uma viagem real iniciada por fora desliga a simulação sem encerrar a viagem nova', () => {
    const env = createEnvironment();
    env.runner.start(setup(ONE_HOUR_DRIVING));
    env.controller.start({
      vehicleType: 'truck',
      settings: getDefaultSettings('truck'),
      utcOffsetMinutes: -180,
      clock: { now: () => REAL_START },
      simulationMode: false,
    });
    expect(env.runner.getSnapshot().status).toBe('idle');
    env.runner.stop();
    expect(env.controller.getSnapshot().trip?.config.vehicleType).toBe('truck');
  });

  it('iniciar de novo troca a simulação anterior por uma nova', () => {
    const env = createEnvironment();
    env.runner.start(setup(ONE_HOUR_DRIVING));
    env.advanceRealTime(seconds(5));
    env.runner.start(setup(ONE_HOUR_DRIVING, { speedFactor: 300 }));
    expect(env.runner.getSnapshot()).toMatchObject({ status: 'running', elapsed: 0, speedFactor: 300 });
    expect(env.controller.getSnapshot().completedTrips).toHaveLength(1);
  });
});
