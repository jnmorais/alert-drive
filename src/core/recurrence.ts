import { type AlertStage, STAGE_ORDER } from './escalation';

export const SEVERE_STAGE: AlertStage = 'mandatory';
export const CONSECUTIVE_SEVERE_EVENTS_TRIGGER = 2;

export interface RecurrenceState {
  consecutiveSevereEvents: number;
  reducedIntervalActive: boolean;
}

export interface RecurrenceUpdate {
  state: RecurrenceState;
  recommendImmediateStop: boolean;
}

export function createRecurrenceTracker(): RecurrenceState {
  return { consecutiveSevereEvents: 0, reducedIntervalActive: false };
}

export function isSevereStage(stage: AlertStage): boolean {
  return STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(SEVERE_STAGE);
}

export function recordEscalationResult(
  state: RecurrenceState,
  maxStage: AlertStage,
): RecurrenceUpdate {
  if (!isSevereStage(maxStage)) {
    return { state: { ...state, consecutiveSevereEvents: 0 }, recommendImmediateStop: false };
  }
  const consecutiveSevereEvents = state.consecutiveSevereEvents + 1;
  const triggered = consecutiveSevereEvents >= CONSECUTIVE_SEVERE_EVENTS_TRIGGER;
  return {
    state: {
      consecutiveSevereEvents,
      reducedIntervalActive: state.reducedIntervalActive || triggered,
    },
    recommendImmediateStop: triggered,
  };
}

export function registerBreak(): RecurrenceState {
  return createRecurrenceTracker();
}
