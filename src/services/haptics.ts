import { Vibration } from 'react-native';

import { VIBRATION_TIMINGS } from '../core/alertVibration';
import type { AlertVibrator } from '../state/alertVibration';

export const deviceVibrator: AlertVibrator = {
  vibrate(cue) {
    Vibration.cancel();
    Vibration.vibrate([...VIBRATION_TIMINGS[cue.pattern]], true);
  },
  stop() {
    Vibration.cancel();
  },
};
