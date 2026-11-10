import { type AlertVoiceCue, desiredAlertVoice } from '../core/alertVoice';
import type { TripController } from './tripController';

export interface AlertVoice {
  speak(cue: AlertVoiceCue): void;
  stop(): void;
}

type ObservedController = Pick<TripController, 'getSnapshot' | 'subscribe'>;

export function connectAlertVoice(controller: ObservedController, voice: AlertVoice): () => void {
  let activeKey: string | null = null;

  function sync(): void {
    const cue = desiredAlertVoice(controller.getSnapshot().trip);
    const key = cue?.key ?? null;
    if (key === activeKey) {
      return;
    }
    activeKey = key;
    if (cue === null) {
      voice.stop();
    } else {
      voice.speak(cue);
    }
  }

  const unsubscribe = controller.subscribe(sync);
  sync();

  return () => {
    unsubscribe();
    if (activeKey !== null) {
      voice.stop();
    }
  };
}
