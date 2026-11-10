import { describe, expect, it } from '@jest/globals';

import type { AlertVoiceCue } from '../core/alertVoice';
import { minutes, seconds } from '../core/duration';
import { getDefaultSettings } from '../core/profiles';
import type { Clock } from '../core/types';
import { ALERT_SCREEN_MESSAGES } from '../text/alertText';
import { type AlertVoice, connectAlertVoice } from './alertVoice';
import { createTripController, type TimerScheduler } from './tripController';

const START = Date.UTC(2026, 9, 24, 12, 0, 0);

interface PendingTimer {
  dueAt: number;
  callback: () => void;
  cancelled: boolean;
}

function recordingVoice(): AlertVoice & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    speak(cue: AlertVoiceCue) {
      calls.push(`falar: ${cue.text}`);
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
  const voice = recordingVoice();
  const disconnect = connectAlertVoice(controller, voice);

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

  return { controller, voice, disconnect, advanceBy, startAndDriveUntilCheck };
}

const SPOKEN = `falar: ${ALERT_SCREEN_MESSAGES.mandatory}`;

describe('RF08 e RF11 - mensagem de voz durante o alerta', () => {
  it('fala uma vez ao entrar na etapa 2, com a mesma frase da tela, e não repete na etapa 3', () => {
    const env = createTripEnvironment();
    env.startAndDriveUntilCheck();
    env.advanceBy(seconds(15));
    expect(env.voice.calls).toEqual([]);
    env.advanceBy(seconds(15));
    env.advanceBy(seconds(15));
    env.advanceBy(minutes(1));
    expect(env.controller.getSnapshot().trip?.escalation?.stage).toBe('maximum');
    expect(env.voice.calls).toEqual([SPOKEN]);
  });

  it('para de falar quando o motorista responde ou a viagem termina', () => {
    const answered = createTripEnvironment();
    answered.startAndDriveUntilCheck();
    answered.advanceBy(seconds(31));
    answered.controller.respond();
    expect(answered.voice.calls).toEqual([SPOKEN, 'parar']);

    const ended = createTripEnvironment();
    ended.startAndDriveUntilCheck();
    ended.advanceBy(seconds(31));
    ended.controller.end();
    expect(ended.voice.calls).toEqual([SPOKEN, 'parar']);
  });

  it('desconectar durante a fala para a voz, e sem fala não manda parar', () => {
    const speaking = createTripEnvironment();
    speaking.startAndDriveUntilCheck();
    speaking.advanceBy(seconds(31));
    speaking.disconnect();
    expect(speaking.voice.calls).toEqual([SPOKEN, 'parar']);

    const quiet = createTripEnvironment();
    quiet.disconnect();
    expect(quiet.voice.calls).toEqual([]);
  });
});

describe('RF09 e RF10 - voz obedece ao silenciar', () => {
  it('silenciar para a fala; reativar no mesmo alerta fala de novo', () => {
    const env = createTripEnvironment();
    env.startAndDriveUntilCheck();
    env.advanceBy(seconds(31));
    env.controller.toggleSilence();
    env.controller.toggleSilence();
    expect(env.voice.calls).toEqual([SPOKEN, 'parar', SPOKEN]);
  });
});
