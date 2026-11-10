import { type AlertVibrationCue, desiredAlertVibration } from '../core/alertVibration';
import type { TripController } from './tripController';

export interface AlertVibrator {
  vibrate(cue: AlertVibrationCue): void;
  stop(): void;
}

type ObservedController = Pick<TripController, 'getSnapshot' | 'subscribe'>;

export function connectAlertVibration(controller: ObservedController, vibrator: AlertVibrator): () => void {
  let activeKey: string | null = null;

  function sync(): void {
    const cue = desiredAlertVibration(controller.getSnapshot().trip);
    const key = cue?.key ?? null;
    if (key === activeKey) {
      return;
    }
    activeKey = key;
    if (cue === null) {
      vibrator.stop();
    } else {
      vibrator.vibrate(cue);
    }
  }

  const unsubscribe = controller.subscribe(sync);
  sync();

  return () => {
    unsubscribe();
    if (activeKey !== null) {
      vibrator.stop();
    }
  };
}
