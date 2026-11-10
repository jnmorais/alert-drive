import { effectiveChannels } from './alertChannels';
import { STAGE_BEHAVIOR, STAGE_ORDER } from './escalation';
import { isCheckActive, type TripState } from './trip';

export interface AlertVoiceCue {
  text: string;
  key: string;
}

export function desiredAlertVoice(trip: TripState | null): AlertVoiceCue | null {
  if (trip === null || trip.escalation === null || !isCheckActive(trip)) {
    return null;
  }
  if (!effectiveChannels(trip.channels).sound) {
    return null;
  }
  const { stage, checkStartedAt } = trip.escalation;
  const reachedStages = STAGE_ORDER.slice(0, STAGE_ORDER.indexOf(stage) + 1);
  const spokenStage = reachedStages.find((reached) => STAGE_BEHAVIOR[reached].voiceMessage !== null);
  const text = spokenStage === undefined ? null : STAGE_BEHAVIOR[spokenStage].voiceMessage;
  if (text === null) {
    return null;
  }
  return { text, key: `${checkStartedAt}` };
}
