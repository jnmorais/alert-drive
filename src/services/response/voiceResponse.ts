import { seconds } from '../../core/duration';
import type { Clock, Milliseconds } from '../../core/types';
import { isAffirmativeVoiceResponse } from '../../core/voiceCommand';
import type { ResponseListener, ResponseProvider } from './ResponseProvider';

export type VoicePreparation = 'ready' | 'denied' | 'unsupported';

export type VoiceReadiness = 'unknown' | 'preparing' | VoicePreparation;

export interface RecognitionHandlers {
  onTranscripts(transcripts: string[]): void;
  onEnd(): void;
  onUnavailable(): void;
}

export interface SpeechRecognizer {
  prepare(): Promise<VoicePreparation>;
  listen(handlers: RecognitionHandlers): () => void;
}

export interface VoiceRecognition {
  readonly recognizer: SpeechRecognizer;
  getReadiness(): VoiceReadiness;
  subscribe(listener: () => void): () => void;
  prepare(): Promise<void>;
  markUnsupported(): void;
}

export interface RestartScheduler {
  schedule(callback: () => void, delay: Milliseconds): () => void;
}

export const LISTENING_RESTART_DELAY: Milliseconds = seconds(0.5);

export function createVoiceRecognition(recognizer: SpeechRecognizer): VoiceRecognition {
  let readiness: VoiceReadiness = 'unknown';
  const listeners = new Set<() => void>();

  function publish(next: VoiceReadiness): void {
    readiness = next;
    listeners.forEach((listener) => listener());
  }

  return {
    recognizer,
    getReadiness: () => readiness,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async prepare() {
      if (readiness === 'preparing') {
        return;
      }
      publish('preparing');
      try {
        publish(await recognizer.prepare());
      } catch {
        publish('unsupported');
      }
    },
    markUnsupported() {
      publish('unsupported');
    },
  };
}

export function createVoiceResponseProvider(
  clock: Clock,
  voice: VoiceRecognition,
  scheduler: RestartScheduler,
): ResponseProvider {
  let listener: ResponseListener | null = null;
  let stopSession: (() => void) | null = null;
  let cancelRestart: (() => void) | null = null;

  function endSession(): void {
    cancelRestart?.();
    cancelRestart = null;
    const stopping = stopSession;
    stopSession = null;
    stopping?.();
  }

  function beginSession(): void {
    if (listener === null || voice.getReadiness() !== 'ready') {
      return;
    }
    stopSession = voice.recognizer.listen({
      onTranscripts(transcripts) {
        const current = listener;
        if (current === null || !isAffirmativeVoiceResponse(transcripts)) {
          return;
        }
        stop();
        current({ method: 'voice', at: clock.now() });
      },
      onEnd() {
        stopSession = null;
        if (listener !== null && cancelRestart === null) {
          cancelRestart = scheduler.schedule(() => {
            cancelRestart = null;
            beginSession();
          }, LISTENING_RESTART_DELAY);
        }
      },
      onUnavailable() {
        stopSession = null;
        voice.markUnsupported();
      },
    });
  }

  function stop(): void {
    listener = null;
    endSession();
  }

  return {
    method: 'voice',
    isAvailable: () => voice.getReadiness() === 'ready',
    start(nextListener) {
      endSession();
      listener = nextListener;
      beginSession();
    },
    stop,
    isListening: () => listener !== null,
  };
}
