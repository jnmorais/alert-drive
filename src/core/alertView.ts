import { seconds } from './duration';
import { type AlertStage, STAGE_BEHAVIOR, type VisualPattern } from './escalation';
import { hasHandsFreeResponse, isResponseMethodAllowed, type ResponseContext, type ResponseMethod } from './responsePolicy';
import { isCheckActive, type TripState } from './trip';
import type { Milliseconds } from './types';

export const BLINK_PHASE_DURATION: Milliseconds = seconds(0.5);
export const MAX_FLASHES_PER_SECOND = 3;

const PHASES_PER_FLASH = 2;

export interface ActiveAlertView {
  stage: AlertStage;
  visual: VisualPattern;
  touchAllowed: boolean;
  handsFreeAvailable: boolean;
}

export function blinkFlashesPerSecond(phaseDuration: Milliseconds): number {
  return seconds(1) / (phaseDuration * PHASES_PER_FLASH);
}

export function describeActiveAlert(
  trip: TripState,
  context: ResponseContext,
  supportedMethods: readonly ResponseMethod[],
): ActiveAlertView | null {
  if (trip.escalation === null || !isCheckActive(trip)) {
    return null;
  }
  const { stage } = trip.escalation;
  return {
    stage,
    visual: STAGE_BEHAVIOR[stage].visual,
    touchAllowed: supportedMethods.includes('touch') && isResponseMethodAllowed('touch', context),
    handsFreeAvailable: hasHandsFreeResponse(supportedMethods),
  };
}
