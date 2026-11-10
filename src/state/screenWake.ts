import { shouldKeepScreenAwake } from '../core/screenWake';
import type { TripController } from './tripController';

export interface ScreenWake {
  keepAwake(): void;
  allowSleep(): void;
}

type ObservedController = Pick<TripController, 'getSnapshot' | 'subscribe'>;

export function connectScreenWake(controller: ObservedController, screen: ScreenWake): () => void {
  let awake = false;

  function sync(): void {
    const wanted = shouldKeepScreenAwake(controller.getSnapshot().trip);
    if (wanted === awake) {
      return;
    }
    awake = wanted;
    if (wanted) {
      screen.keepAwake();
    } else {
      screen.allowSleep();
    }
  }

  const unsubscribe = controller.subscribe(sync);
  sync();

  return () => {
    unsubscribe();
    if (awake) {
      screen.allowSleep();
    }
  };
}
