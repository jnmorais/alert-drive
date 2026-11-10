import { type AlertSoundCue, desiredAlertSound, noticeSound } from '../core/alertSound';
import type { TripController } from './tripController';

export interface AlertSoundPlayer {
  play(cue: AlertSoundCue): void;
  stop(): void;
}

type ObservedController = Pick<TripController, 'getSnapshot' | 'subscribe' | 'subscribeEffects'>;

export function connectAlertSound(controller: ObservedController, player: AlertSoundPlayer): () => void {
  let alertKey: string | null = null;

  function syncAlert(): void {
    const cue = desiredAlertSound(controller.getSnapshot().trip);
    const key = cue?.key ?? null;
    if (key === alertKey) {
      return;
    }
    alertKey = key;
    if (cue === null) {
      player.stop();
    } else {
      player.play(cue);
    }
  }

  const unsubscribe = controller.subscribe(syncAlert);
  const unsubscribeEffects = controller.subscribeEffects((effects, snapshot) => {
    const notice = noticeSound(effects, snapshot.trip);
    if (notice !== null) {
      player.play(notice);
    }
  });
  syncAlert();

  return () => {
    unsubscribe();
    unsubscribeEffects();
    if (alertKey !== null) {
      player.stop();
    }
  };
}
