import { describe, expect, it } from '@jest/globals';

import { minutes, seconds } from '../../core/duration';
import { getDefaultSettings } from '../../core/profiles';
import type { ResponseContext } from '../../core/responsePolicy';
import type { Clock } from '../../core/types';
import { createTripController, type TimerScheduler } from '../../state/tripController';
import type { DriverResponse } from './ResponseProvider';
import { createTouchResponseProvider } from './touchResponse';
import {
  createVoiceRecognition,
  createVoiceResponseProvider,
  LISTENING_RESTART_DELAY,
  type RecognitionHandlers,
  type SpeechRecognizer,
  type VoicePreparation,
} from './voiceResponse';

const START = Date.UTC(2026, 10, 10, 12, 0, 0);
const MOVING: ResponseContext = { movement: 'moving', simulationMode: false };

interface PendingTimer {
  dueAt: number;
  callback: () => void;
  cancelled: boolean;
}

function createEnvironment(preparation: VoicePreparation | Error = 'ready') {
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
  const sessions: { handlers: RecognitionHandlers; stopped: boolean }[] = [];
  let prepareCalls = 0;
  const recognizer: SpeechRecognizer = {
    async prepare() {
      prepareCalls += 1;
      if (preparation instanceof Error) {
        throw preparation;
      }
      return preparation;
    },
    listen(handlers) {
      const session = { handlers, stopped: false };
      sessions.push(session);
      return () => {
        session.stopped = true;
      };
    },
  };
  const voice = createVoiceRecognition(recognizer);
  const provider = createVoiceResponseProvider(clock, voice, timers);

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

  const activeSession = () => sessions.filter((session) => !session.stopped).at(-1);

  return { clock, timers, voice, provider, sessions, activeSession, advanceBy, prepareCalls: () => prepareCalls };
}

describe('RF06 - preparação da resposta por voz', () => {
  it('começa desconhecida e fica pronta depois de preparar', async () => {
    const env = createEnvironment('ready');
    expect(env.voice.getReadiness()).toBe('unknown');
    expect(env.provider.isAvailable(MOVING)).toBe(false);
    await env.voice.prepare();
    expect(env.voice.getReadiness()).toBe('ready');
    expect(env.provider.isAvailable(MOVING)).toBe(true);
  });

  it('informa a falta de permissão, de suporte offline ou uma falha', async () => {
    const denied = createEnvironment('denied');
    await denied.voice.prepare();
    expect(denied.voice.getReadiness()).toBe('denied');

    const unsupported = createEnvironment('unsupported');
    await unsupported.voice.prepare();
    expect(unsupported.voice.getReadiness()).toBe('unsupported');

    const failed = createEnvironment(new Error('módulo ausente'));
    await failed.voice.prepare();
    expect(failed.voice.getReadiness()).toBe('unsupported');
  });

  it('avisa quem acompanha e ignora um segundo pedido enquanto prepara', async () => {
    const env = createEnvironment('ready');
    const seen: string[] = [];
    const unsubscribe = env.voice.subscribe(() => seen.push(env.voice.getReadiness()));
    const first = env.voice.prepare();
    await env.voice.prepare();
    await first;
    unsubscribe();
    env.voice.markUnsupported();
    expect(seen).toEqual(['preparing', 'ready']);
    expect(env.prepareCalls()).toBe(1);
  });
});

describe('RF06 - resposta por voz durante o alerta', () => {
  it('escuta só depois de começar e aceita "estou bem" com o horário da resposta', async () => {
    const env = createEnvironment();
    await env.voice.prepare();
    expect(env.sessions).toHaveLength(0);
    const responses: DriverResponse[] = [];
    env.provider.start((response) => responses.push(response));
    expect(env.provider.isListening()).toBe(true);
    env.activeSession()?.handlers.onTranscripts(['estou']);
    expect(responses).toEqual([]);
    env.advanceBy(seconds(3));
    env.activeSession()?.handlers.onTranscripts(['estou bem']);
    expect(responses).toEqual([{ method: 'voice', at: START + seconds(3) }]);
    expect(env.provider.isListening()).toBe(false);
    expect(env.sessions.every((session) => session.stopped)).toBe(true);
  });

  it('recusa a negação e continua escutando', async () => {
    const env = createEnvironment();
    await env.voice.prepare();
    const responses: DriverResponse[] = [];
    env.provider.start((response) => responses.push(response));
    env.activeSession()?.handlers.onTranscripts(['não estou bem']);
    expect(responses).toEqual([]);
    expect(env.provider.isListening()).toBe(true);
  });

  it('volta a escutar meio segundo depois que o Android encerra uma sessão', async () => {
    const env = createEnvironment();
    await env.voice.prepare();
    env.provider.start(() => undefined);
    env.sessions[0]?.handlers.onEnd();
    env.sessions[0]?.handlers.onEnd();
    expect(env.sessions).toHaveLength(1);
    env.advanceBy(LISTENING_RESTART_DELAY);
    expect(LISTENING_RESTART_DELAY).toBe(500);
    expect(env.sessions).toHaveLength(2);
    expect(env.activeSession()).toBe(env.sessions[1]);
  });

  it('parar cancela a escuta e o recomeço agendado', async () => {
    const env = createEnvironment();
    await env.voice.prepare();
    env.provider.start(() => undefined);
    env.sessions[0]?.handlers.onEnd();
    env.provider.stop();
    env.advanceBy(seconds(5));
    expect(env.sessions).toHaveLength(1);
    env.sessions[0]?.handlers.onTranscripts(['ok']);
    expect(env.provider.isListening()).toBe(false);
  });

  it('se o celular recusar o reconhecimento offline, marca sem suporte e não insiste', async () => {
    const env = createEnvironment();
    await env.voice.prepare();
    env.provider.start(() => undefined);
    env.sessions[0]?.handlers.onUnavailable();
    env.advanceBy(seconds(5));
    expect(env.voice.getReadiness()).toBe('unsupported');
    expect(env.provider.isAvailable(MOVING)).toBe(false);
    expect(env.sessions).toHaveLength(1);
  });

  it('sem a voz pronta, aceita o pedido de escuta mas não liga o microfone', () => {
    const env = createEnvironment();
    env.provider.start(() => undefined);
    expect(env.provider.isListening()).toBe(true);
    expect(env.sessions).toHaveLength(0);
  });
});

describe('RF06 e RF07 - "estou bem" encerra o alerta da viagem', () => {
  it('responder por voz com o veículo em movimento encerra a verificação e registra o tempo', async () => {
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
    const sessions: RecognitionHandlers[] = [];
    const voice = createVoiceRecognition({
      prepare: async () => 'ready',
      listen(handlers) {
        sessions.push(handlers);
        return () => undefined;
      },
    });
    await voice.prepare();
    const controller = createTripController({
      timers,
      createResponseProviders: (tripClock) => [
        createTouchResponseProvider(tripClock),
        createVoiceResponseProvider(tripClock, voice, timers),
      ],
    });
    controller.start({
      vehicleType: 'truck',
      settings: getDefaultSettings('truck'),
      utcOffsetMinutes: -180,
      clock,
      simulationMode: false,
    });
    while (now < START + minutes(10)) {
      controller.pushSpeedSample(80);
      const target = now + seconds(1);
      for (const timer of pending.filter((candidate) => !candidate.cancelled && candidate.dueAt <= target)) {
        timer.cancelled = true;
        now = timer.dueAt;
        timer.callback();
      }
      now = target;
    }
    controller.pushSpeedSample(80);
    expect(controller.getSnapshot().trip?.escalation?.outcome).toBeNull();
    expect(controller.responseContext()?.movement).toBe('moving');
    now += seconds(6);
    sessions.at(-1)?.onTranscripts(['tô bem']);
    const resolved = controller.getSnapshot().effects.filter((effect) => effect.type === 'checkResolved');
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.type === 'checkResolved' && resolved[0].outcome.responseTime).toBe(seconds(6));
  });
});
