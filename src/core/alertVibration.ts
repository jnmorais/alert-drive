import { effectiveChannels } from './alertChannels';
import { seconds } from './duration';
import { STAGE_BEHAVIOR, type VibrationPattern } from './escalation';
import { isCheckActive, type TripState } from './trip';
import type { Milliseconds } from './types';

export type ActiveVibrationPattern = Exclude<VibrationPattern, 'none'>;

export interface AlertVibrationCue {
  pattern: ActiveVibrationPattern;
  key: string;
}

export const VIBRATION_TIMINGS: Readonly<Record<ActiveVibrationPattern, readonly Milliseconds[]>> = {
  shortPulses: [0, seconds(0.2), seconds(0.8)],
  continuous: [0, seconds(1)],
};

export function desiredAlertVibration(trip: TripState | null): AlertVibrationCue | null {
  if (trip === null || trip.escalation === null || !isCheckActive(trip)) {
    return null;
  }
  if (!effectiveChannels(trip.channels).vibration) {
    return null;
  }
  const { stage, checkStartedAt } = trip.escalation;
  const pattern = STAGE_BEHAVIOR[stage].vibration;
  if (pattern === 'none') {
    return null;
  }
  return { pattern, key: `${checkStartedAt}:${pattern}` };
}
