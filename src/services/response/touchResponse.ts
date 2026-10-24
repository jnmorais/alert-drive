import { isResponseMethodAllowed, type ResponseContext } from '../../core/responsePolicy';
import type { Clock } from '../../core/types';
import type { ResponseListener, ResponseProvider } from './ResponseProvider';

export type TouchRejection = 'notListening' | 'vehicleMoving';

export type TouchResult = { accepted: true } | { accepted: false; reason: TouchRejection };

export interface TouchResponseProvider extends ResponseProvider {
  readonly method: 'touch';
  press(context: ResponseContext): TouchResult;
}

export function createTouchResponseProvider(clock: Clock): TouchResponseProvider {
  let listener: ResponseListener | null = null;

  return {
    method: 'touch',
    isAvailable: (context) => isResponseMethodAllowed('touch', context),
    start(nextListener) {
      listener = nextListener;
    },
    stop() {
      listener = null;
    },
    isListening: () => listener !== null,
    press(context) {
      if (listener === null) {
        return { accepted: false, reason: 'notListening' };
      }
      if (!isResponseMethodAllowed('touch', context)) {
        return { accepted: false, reason: 'vehicleMoving' };
      }
      listener({ method: 'touch', at: clock.now() });
      return { accepted: true };
    },
  };
}
