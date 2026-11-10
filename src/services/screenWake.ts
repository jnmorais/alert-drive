import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import type { ScreenWake } from '../state/screenWake';

const TRIP_WAKE_TAG = 'alert-drive-trip';

export const deviceScreenWake: ScreenWake = {
  keepAwake() {
    void activateKeepAwakeAsync(TRIP_WAKE_TAG).catch(() => undefined);
  },
  allowSleep() {
    void deactivateKeepAwake(TRIP_WAKE_TAG).catch(() => undefined);
  },
};
