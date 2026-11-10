import { describe, expect, it } from '@jest/globals';

import { minutes, seconds } from '../core/duration';
import type { LocationReading } from '../core/gpsSpeed';
import { getDefaultSettings } from '../core/profiles';
import { describeTripStatus } from '../core/tripStatus';
import type { Clock } from '../core/types';
import { createGpsTracker, type LocationPermission, type LocationSource } from './gpsTracker';
import { createTripController, type TimerScheduler } from './tripController';

const START = Date.UTC(2026, 10, 10, 12, 0, 0);

interface PendingTimer {
  dueAt: number;
  callback: () => void;
  cancelled: boolean;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function fakeSource(permission: LocationPermission | Error = 'granted') {
  const log: string[] = [];
  let emit: ((reading: LocationReading) => void) | null = null;
  let lastCallback: ((reading: LocationReading) => void) | null = null;
  const permissionRequest = deferred<LocationPermission>();
  const watchStart = deferred<void>();
  const source: LocationSource = {
    requestPermission() {
      log.push('pedir permissão');
      return permissionRequest.promise;
    },
    async watch(onReading) {
      log.push('ligar GPS');
      lastCallback = onReading;
      await watchStart.promise;
      emit = onReading;
      return () => {
        log.push('desligar GPS');
        emit = null;
      };
    },
  };
  function grantPermission(): void {
    if (permission instanceof Error) {
      permissionRequest.reject(permission);
    } else {
      permissionRequest.resolve(permission);
    }
  }
  return {
    source,
    log,
    grantPermission,
    finishWatchStart: () => watchStart.resolve(),
    grantNow() {
      grantPermission();
      watchStart.resolve();
    },
    emit(reading: LocationReading) {
      emit?.(reading);
    },
    emitLate(reading: LocationReading) {
      lastCallback?.(reading);
    },
    isWatching: () => emit !== null,
  };
}

function createEnvironment(permission: LocationPermission | Error = 'granted') {
  let now = START;
  const pending: PendingTimer[] = [];
  const clock: Clock = { now: () => now };
  const timers: TimerScheduler = {
    schedule(callback, delay) {
      const timer = { dueAt: now + delay, callback, cancelled: false };
      pending.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  };
  const controller = createTripController({ timers });
  const location = fakeSource(permission);
  const tracker = createGpsTracker({ controller, source: location.source, timers });
  const disconnect = tracker.connect();

  function advanceBy(duration: number): void {
    const target = now + duration;
    for (;;) {
      const next = pending
        .filter((timer) => !timer.cancelled && timer.dueAt <= target)
        .sort((first, second) => first.dueAt - second.dueAt)[0];
      if (!next) {
        break;
      }
      next.cancelled = true;
      now = Math.max(now, next.dueAt);
      next.callback();
    }
    now = target;
  }

  function startTrip(simulationMode = false): void {
    controller.start({
      vehicleType: 'car',
      settings: getDefaultSettings('car'),
      utcOffsetMinutes: -180,
      clock,
      simulationMode,
    });
  }

  function reading(speedMetersPerSecond: number | null): void {
    location.emit({ at: now, speedMetersPerSecond });
  }

  return { controller, tracker, disconnect, location, advanceBy, startTrip, reading, now: () => now };
}

async function trackingEnvironment() {
  const env = createEnvironment();
  env.startTrip();
  env.location.grantNow();
  await flush();
  return env;
}

describe('RF03 - velocidade do GPS na viagem real', () => {
  it('pede a permissão, liga o GPS e passa a velocidade em km/h para a viagem', async () => {
    const env = createEnvironment();
    expect(env.tracker.getSnapshot()).toEqual({ state: 'inactive' });
    env.startTrip();
    expect(env.tracker.getSnapshot()).toEqual({ state: 'requesting' });
    env.location.grantNow();
    await flush();
    expect(env.tracker.getSnapshot()).toEqual({ state: 'waiting' });
    env.reading(25);
    expect(env.tracker.getSnapshot()).toEqual({ state: 'tracking', speedKmh: 90 });
    expect(env.controller.getSnapshot().trip?.driveTimer.movement).toBe('moving');
    expect(env.location.log).toEqual(['pedir permissão', 'ligar GPS']);
  });

  it('as leituras do GPS acumulam o tempo de direção', async () => {
    const env = await trackingEnvironment();
    for (let elapsed = 0; elapsed <= minutes(2); elapsed += seconds(1)) {
      env.reading(22);
      env.advanceBy(seconds(1));
    }
    env.reading(22);
    const trip = env.controller.getSnapshot().trip;
    expect(trip).not.toBeNull();
    if (trip !== null) {
      expect(describeTripStatus(trip, env.now()).drivingTime).toBeGreaterThanOrEqual(minutes(2));
    }
  });

  it('ignora leituras sem velocidade, sem mexer no tempo de direção', async () => {
    const env = await trackingEnvironment();
    env.reading(null);
    expect(env.tracker.getSnapshot()).toEqual({ state: 'waiting' });
    expect(env.controller.getSnapshot().trip?.driveTimer.movement).not.toBe('moving');
  });

  it('volta a "aguardando sinal" depois de 10 s sem leitura válida', async () => {
    const env = await trackingEnvironment();
    env.reading(20);
    env.advanceBy(seconds(9));
    expect(env.tracker.getSnapshot().state).toBe('tracking');
    env.advanceBy(seconds(1));
    expect(env.tracker.getSnapshot()).toEqual({ state: 'waiting' });
  });

  it('não liga o GPS no modo simulação', async () => {
    const env = createEnvironment();
    env.startTrip(true);
    env.location.grantNow();
    await flush();
    expect(env.tracker.getSnapshot()).toEqual({ state: 'inactive' });
    expect(env.location.log).toEqual([]);
  });
});

describe('RF03 e RNF04 - GPS desligado fora da viagem', () => {
  it('desliga o GPS quando a viagem termina e ignora leituras atrasadas', async () => {
    const env = await trackingEnvironment();
    env.reading(20);
    env.controller.end();
    expect(env.tracker.getSnapshot()).toEqual({ state: 'inactive' });
    expect(env.location.log).toEqual(['pedir permissão', 'ligar GPS', 'desligar GPS']);
    env.advanceBy(seconds(20));
    expect(env.tracker.getSnapshot()).toEqual({ state: 'inactive' });
  });

  it('se a viagem termina durante o pedido de permissão, não liga o GPS', async () => {
    const env = createEnvironment();
    env.startTrip();
    env.controller.end();
    env.location.grantNow();
    await flush();
    expect(env.tracker.getSnapshot()).toEqual({ state: 'inactive' });
    expect(env.location.log).toEqual(['pedir permissão']);
  });

  it('se a viagem termina enquanto o GPS liga, ele é desligado logo em seguida', async () => {
    const env = createEnvironment();
    env.startTrip();
    env.location.grantPermission();
    await flush();
    expect(env.location.log).toEqual(['pedir permissão', 'ligar GPS']);
    env.controller.end();
    env.location.finishWatchStart();
    await flush();
    expect(env.location.log).toEqual(['pedir permissão', 'ligar GPS', 'desligar GPS']);
    expect(env.location.isWatching()).toBe(false);
    expect(env.tracker.getSnapshot()).toEqual({ state: 'inactive' });
  });

  it('ignora uma leitura entregue pelo aparelho depois de o GPS ser desligado', async () => {
    const env = await trackingEnvironment();
    env.controller.end();
    env.location.emitLate({ at: env.now(), speedMetersPerSecond: 30 });
    expect(env.tracker.getSnapshot()).toEqual({ state: 'inactive' });
  });

  it('desconectar o rastreador desliga o GPS e deixa de acompanhar a viagem', async () => {
    const env = await trackingEnvironment();
    env.disconnect();
    expect(env.location.isWatching()).toBe(false);
    env.controller.end();
    env.startTrip();
    expect(env.location.log.filter((entry) => entry === 'pedir permissão')).toHaveLength(1);
  });
});

describe('RF03 - avisos quando o GPS não está disponível', () => {
  it('sem permissão de localização', async () => {
    const env = createEnvironment('denied');
    env.startTrip();
    env.location.grantNow();
    await flush();
    expect(env.tracker.getSnapshot()).toEqual({ state: 'denied' });
    expect(env.location.log).toEqual(['pedir permissão']);
  });

  it('com a localização do aparelho desligada', async () => {
    const env = createEnvironment('servicesOff');
    env.startTrip();
    env.location.grantNow();
    await flush();
    expect(env.tracker.getSnapshot()).toEqual({ state: 'servicesOff' });
  });

  it('quando o GPS falha', async () => {
    const env = createEnvironment(new Error('falha do GPS'));
    env.startTrip();
    env.location.grantNow();
    await flush();
    expect(env.tracker.getSnapshot()).toEqual({ state: 'error' });
  });

  it('uma falha do GPS que chega depois do fim da viagem não gera aviso', async () => {
    const env = createEnvironment(new Error('falha do GPS'));
    env.startTrip();
    env.controller.end();
    env.location.grantNow();
    await flush();
    expect(env.tracker.getSnapshot()).toEqual({ state: 'inactive' });
  });

  it('avisa quem acompanha a situação do GPS e deixa de avisar ao cancelar', async () => {
    const env = createEnvironment();
    const seen: string[] = [];
    const unsubscribe = env.tracker.subscribe(() => seen.push(env.tracker.getSnapshot().state));
    env.startTrip();
    env.location.grantNow();
    await flush();
    unsubscribe();
    env.reading(10);
    expect(seen).toEqual(['requesting', 'waiting']);
  });
});
