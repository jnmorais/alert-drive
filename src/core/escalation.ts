import type { ProfileSettings } from './profiles';
import type { EpochMilliseconds, Milliseconds } from './types';

export type AlertStage = 'check' | 'preventive' | 'mandatory' | 'maximum';

export const STAGE_ORDER: readonly AlertStage[] = ['check', 'preventive', 'mandatory', 'maximum'];

export const ALERT_MESSAGE = 'Atenção. Sinais de sonolência. Procure um local seguro para parar.';

export type SoundPattern = 'shortTone' | 'alarm';
export type VisualPattern = 'message' | 'fixedBanner' | 'blinking' | 'fullScreen';
export type VibrationPattern = 'none' | 'shortPulses' | 'continuous';

export interface StageBehavior {
  simulatedLevel: number;
  sound: SoundPattern;
  relativeVolume: number;
  visual: VisualPattern;
  vibration: VibrationPattern;
  screenMessage: string | null;
  voiceMessage: string | null;
}

export const STAGE_BEHAVIOR: Readonly<Record<AlertStage, StageBehavior>> = {
  check: {
    simulatedLevel: 6,
    sound: 'shortTone',
    relativeVolume: 0.5,
    visual: 'message',
    vibration: 'none',
    screenMessage: null,
    voiceMessage: null,
  },
  preventive: {
    simulatedLevel: 7,
    sound: 'alarm',
    relativeVolume: 0.5,
    visual: 'fixedBanner',
    vibration: 'shortPulses',
    screenMessage: null,
    voiceMessage: null,
  },
  mandatory: {
    simulatedLevel: 8,
    sound: 'alarm',
    relativeVolume: 0.75,
    visual: 'blinking',
    vibration: 'continuous',
    screenMessage: ALERT_MESSAGE,
    voiceMessage: ALERT_MESSAGE,
  },
  maximum: {
    simulatedLevel: 9,
    sound: 'alarm',
    relativeVolume: 1,
    visual: 'fullScreen',
    vibration: 'continuous',
    screenMessage: ALERT_MESSAGE,
    voiceMessage: null,
  },
};

export type EscalationTiming = Pick<ProfileSettings, 'responseWindow' | 'escalationStepDuration'>;

export function stageOffset(stage: AlertStage, timing: EscalationTiming): Milliseconds {
  const index = STAGE_ORDER.indexOf(stage);
  if (index === 0) {
    return 0;
  }
  return timing.responseWindow + (index - 1) * timing.escalationStepDuration;
}

export interface EscalationOutcome {
  respondedAt: EpochMilliseconds;
  responseTime: Milliseconds;
  maxStage: AlertStage;
  simulatedLevel: number;
}

export interface EscalationState {
  checkStartedAt: EpochMilliseconds;
  stage: AlertStage;
  outcome: EscalationOutcome | null;
}

export interface StageTransition {
  stage: AlertStage;
  dueAt: EpochMilliseconds;
}

export interface EscalationUpdate {
  state: EscalationState;
  transitions: StageTransition[];
}

export function startEscalation(checkStartedAt: EpochMilliseconds): EscalationState {
  return { checkStartedAt, stage: 'check', outcome: null };
}

export function isEscalationActive(state: EscalationState): boolean {
  return state.outcome === null;
}

function followingStage(stage: AlertStage): AlertStage | null {
  return STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1] ?? null;
}

export function nextStageDueAt(
  state: EscalationState,
  timing: EscalationTiming,
): EpochMilliseconds | null {
  const next = followingStage(state.stage);
  if (!isEscalationActive(state) || next === null) {
    return null;
  }
  return state.checkStartedAt + stageOffset(next, timing);
}

export function advanceEscalation(
  state: EscalationState,
  now: EpochMilliseconds,
  timing: EscalationTiming,
): EscalationUpdate {
  const transitions: StageTransition[] = [];
  if (!isEscalationActive(state)) {
    return { state, transitions };
  }
  let current = state;
  for (let next = followingStage(current.stage); next !== null; next = followingStage(next)) {
    const dueAt = state.checkStartedAt + stageOffset(next, timing);
    if (now < dueAt) {
      break;
    }
    transitions.push({ stage: next, dueAt });
    current = { ...current, stage: next };
  }
  return { state: current, transitions };
}

export interface AcknowledgeUpdate extends EscalationUpdate {
  outcome: EscalationOutcome | null;
}

export function acknowledge(
  state: EscalationState,
  at: EpochMilliseconds,
  timing: EscalationTiming,
): AcknowledgeUpdate {
  if (!isEscalationActive(state) || at < state.checkStartedAt) {
    return { state, transitions: [], outcome: null };
  }
  const advanced = advanceEscalation(state, at, timing);
  const outcome: EscalationOutcome = {
    respondedAt: at,
    responseTime: at - state.checkStartedAt,
    maxStage: advanced.state.stage,
    simulatedLevel: STAGE_BEHAVIOR[advanced.state.stage].simulatedLevel,
  };
  return { state: { ...advanced.state, outcome }, transitions: advanced.transitions, outcome };
}
