import { describe, expect, it } from '@jest/globals';

import type { AlertSoundCue } from '../core/alertSound';
import { minutes, seconds } from '../core/duration';
import { getDefaultSettings } from '../core/profiles';
import { startTrip, type TripEffect } from '../core/trip';
import type { Clock } from '../core/types';
import { type AlertSoundPlayer, connectAlertSound } from './alertSound';
import {
  createTripController,
  type EffectsListener,
  type TimerScheduler,
  type TripController,
  type TripSnapshot,
} from './tripController';

const START = Date.UTC(2026, 9, 24, 12, 0, 0);

interface PendingTimer {
  dueAt: number;
  callback: () => void;
  cancelled: boolean;
}

function recordingPlayer(): AlertSoundPlayer & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    play(cue: AlertSoundCue) {
      calls.push(`${cue.pattern} ${cue.volume * 100}%${cue.loop ? ' em laço' : ''}`);
    },
    stop() {
      calls.push('parar');
    },
  };
}

function createTripEnvironment() {
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

  function startAndDriveUntilCheck(): void {
    controller.start({
      vehicleType: 'truck',
      settings: getDefaultSettings('truck'),
      utcOffsetMinutes: -180,
      clock,
      simulationMode: true,
    });
    while (now < START + minutes(10)) {
      controller.pushSpeedSample(80);
      advanceBy(seconds(1));
    }
  }

  return { controller, advanceBy, startAndDriveUntilCheck };
}

describe('RF05 e RF08 - som acompanha a verificação e as etapas do alerta', () => {
  it('tom curto na verificação e alarme em 50, 75 e 100% nas etapas do caminhão', () => {
    const env = createTripEnvironment();
    const player = recordingPlayer();
    connectAlertSound(env.controller, player);
    env.startAndDriveUntilCheck();
    expect(player.calls).toEqual(['shortTone 50%']);
    env.advanceBy(seconds(15));
    env.advanceBy(seconds(15));
    env.advanceBy(seconds(15));
    env.advanceBy(minutes(1));
    expect(player.calls).toEqual(['shortTone 50%', 'alarm 50% em laço', 'alarm 75% em laço', 'alarm 100% em laço']);
  });

  it('para o som quando o motorista responde', () => {
    const env = createTripEnvironment();
    const player = recordingPlayer();
    connectAlertSound(env.controller, player);
    env.startAndDriveUntilCheck();
    env.advanceBy(seconds(20));
    env.controller.respond();
    expect(player.calls).toEqual(['shortTone 50%', 'alarm 50% em laço', 'parar']);
  });

  it('para o som quando a viagem termina com o alerta tocando', () => {
    const env = createTripEnvironment();
    const player = recordingPlayer();
    connectAlertSound(env.controller, player);
    env.startAndDriveUntilCheck();
    env.advanceBy(seconds(35));
    env.controller.end();
    expect(player.calls.slice(-1)).toEqual(['parar']);
  });
});

describe('RF09 e RF10 - som obedece ao silenciar e ao canal sonoro', () => {
  it('silenciar para o alarme e reativar volta a tocar na etapa atual', () => {
    const env = createTripEnvironment();
    const player = recordingPlayer();
    connectAlertSound(env.controller, player);
    env.startAndDriveUntilCheck();
    env.advanceBy(seconds(35));
    env.controller.toggleSilence();
    env.controller.toggleSilence();
    expect(player.calls.slice(-2)).toEqual(['parar', 'alarm 75% em laço']);
  });

  it('com o canal sonoro desligado, nada toca', () => {
    const env = createTripEnvironment();
    const player = recordingPlayer();
    connectAlertSound(env.controller, player);
    env.controller.start({
      vehicleType: 'truck',
      settings: getDefaultSettings('truck'),
      utcOffsetMinutes: -180,
      clock: { now: () => START },
      simulationMode: true,
    });
    env.controller.setChannel('sound', false);
    env.controller.pushSpeedSample(80, START);
    env.controller.pushSpeedSample(80, START + minutes(10));
    expect(env.controller.getSnapshot().trip?.escalation?.stage).toBe('check');
    expect(player.calls).toEqual([]);
  });
});

describe('RF04 e RF13 - tom curto nos avisos', () => {
  function fakeController(trip: TripSnapshot['trip']) {
    const snapshot: TripSnapshot = { trip, simulationMode: true, effects: [], completedTrips: [] };
    const effectsListeners = new Set<EffectsListener>();
    const listeners = new Set<() => void>();
    const controller: Pick<TripController, 'getSnapshot' | 'subscribe' | 'subscribeEffects'> = {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      subscribeEffects(listener) {
        effectsListeners.add(listener);
        return () => effectsListeners.delete(listener);
      },
    };
    function emit(effects: TripEffect[]): void {
      listeners.forEach((listener) => listener());
      effectsListeners.forEach((listener) => listener(effects, snapshot));
    }
    return { controller, emit, effectsListeners, listeners };
  }

  const trip = startTrip({ vehicleType: 'car', settings: getDefaultSettings('car'), utcOffsetMinutes: -180, startedAt: START });

  it('toca o tom curto no pré-aviso e no lembrete de pausa', () => {
    const fake = fakeController(trip);
    const player = recordingPlayer();
    connectAlertSound(fake.controller, player);
    fake.emit([{ type: 'breakPreWarning', at: START + minutes(105) }]);
    fake.emit([{ type: 'breakReminder', at: START + minutes(120) }]);
    expect(player.calls).toEqual(['shortTone 50%', 'shortTone 50%']);
  });

  it('desconectar para de ouvir a viagem sem parar um aviso que já terminou', () => {
    const fake = fakeController(trip);
    const player = recordingPlayer();
    const disconnect = connectAlertSound(fake.controller, player);
    disconnect();
    fake.emit([{ type: 'breakReminder', at: START }]);
    expect(player.calls).toEqual([]);
    expect(fake.listeners.size + fake.effectsListeners.size).toBe(0);
  });

  it('desconectar com o alarme tocando para o som', () => {
    const env = createTripEnvironment();
    const player = recordingPlayer();
    const disconnect = connectAlertSound(env.controller, player);
    env.startAndDriveUntilCheck();
    env.advanceBy(seconds(20));
    disconnect();
    env.advanceBy(seconds(20));
    expect(player.calls).toEqual(['shortTone 50%', 'alarm 50% em laço', 'parar']);
  });
});
