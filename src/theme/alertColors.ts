import type { AlertStage } from '../core/escalation';
import type { AlertColors, ColorPair } from './colors';

export type BlinkFrame = 0 | 1;

export function alertColorPair(alert: AlertColors, stage: AlertStage, frame: BlinkFrame): ColorPair {
  switch (stage) {
    case 'check':
      return alert.checkMessage;
    case 'preventive':
      return alert.preventiveBanner;
    case 'mandatory':
      return alert.mandatoryBlink[frame];
    case 'maximum':
      return alert.maximumFullScreen[frame];
  }
}
