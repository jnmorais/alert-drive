import { describe, expect, it } from '@jest/globals';

import type { AlertVibrationCue } from '../core/alertVibration';
import { minutes, seconds } from '../core/duration';
import { getDefaultSettings } from '../core/profiles';
import type { Clock } from '../core/types';
import { type AlertVibrator, connectAlertVibration } from './alertVibration';
import { createTripController, type TimerScheduler } from './tripController';

const START = Date.UTC(2026, 9, 24, 12, 0, 0);

interface PendingTimer {
  dueAt: number;
  callback: () => void;
  cancelled: boolean;
}

function recordingVibrator(): AlertVibrator & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    vibrate(cue: AlertVibrationCue) {
      calls.push(cue.pattern);
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
  const vibrator = recordingVibrator();
  const disconnect = connectAlertVibration(controller, vibrator);

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

  return { controller, vibrator, disconnect, advanceBy, startAndDriveUntilCheck };
}

describe('RF08 - vibração acompanha as etapas do alerta', () => {
  it('nada na verificação, pulsos curtos na etapa 1 e contínua a partir da etapa 2', () => {
    const env = createTripEnvironment();
    env.startAndDriveUntilCheck();
    expect(env.controller.getSnapshot().trip?.escalation?.stage).toBe('check');
    expect(env.vibrator.calls).toEqual([]);
    env.advanceBy(seconds(15));
    env.advanceBy(seconds(15));
    env.advanceBy(seconds(15));
    env.advanceBy(minutes(1));
    expect(env.controller.getSnapshot().trip?.escalation?.stage).toBe('maximum');
    expect(env.vibrator.calls).toEqual(['shortPulses', 'continuous']);
  });

  it('para quando o motorista responde', () => {
    const env = createTripEnvironment();
    env.startAndDriveUntilCheck();
    env.advanceBy(seconds(35));
    env.controller.respond();
    expect(env.vibrator.calls).toEqual(['shortPulses', 'continuous', 'parar']);
  });

  it('para quando a viagem termina ou quando desconectado', () => {
    const ended = createTripEnvironment();
    ended.startAndDriveUntilCheck();
    ended.advanceBy(seconds(20));
    ended.controller.end();
    expect(ended.vibrator.calls).toEqual(['shortPulses', 'parar']);

    const disconnected = createTripEnvironment();
    disconnected.startAndDriveUntilCheck();
    disconnected.advanceBy(seconds(20));
    disconnected.disconnect();
    disconnected.advanceBy(seconds(20));
    expect(disconnected.vibrator.calls).toEqual(['shortPulses', 'parar']);
  });

  it('desconectar sem vibração ativa não manda parar', () => {
    const env = createTripEnvironment();
    env.disconnect();
    expect(env.vibrator.calls).toEqual([]);
  });
});

describe('RF09 e RF10 - vibração obedece ao canal vibratório', () => {
  it('desligar o canal vibratório no meio do alerta para a vibração', () => {
    const env = createTripEnvironment();
    env.startAndDriveUntilCheck();
    env.advanceBy(seconds(20));
    env.controller.setChannel('vibration', false);
    env.advanceBy(seconds(20));
    expect(env.vibrator.calls).toEqual(['shortPulses', 'parar']);
  });

  it('silenciar não interrompe a vibração', () => {
    const env = createTripEnvironment();
    env.startAndDriveUntilCheck();
    env.advanceBy(seconds(35));
    env.controller.toggleSilence();
    expect(env.vibrator.calls).toEqual(['shortPulses', 'continuous']);
  });
});
