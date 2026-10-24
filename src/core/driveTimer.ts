import type { ProfileSettings } from './profiles';
import type { EpochMilliseconds, Milliseconds } from './types';

export const MOVING_ABOVE_KMH = 10;
export const STOPPED_BELOW_KMH = 5;

export type MovementState = 'moving' | 'stopped';

export interface SpeedSample {
  at: EpochMilliseconds;
  speedKmh: number;
}

export type DriveTimerSettings = Pick<
  ProfileSettings,
  'breakReminderAfter' | 'breakPreWarningLead' | 'minimumBreak'
>;

export interface DriveTimerState {
  movement: MovementState;
  accumulatedDriving: Milliseconds;
  lastSampleAt: EpochMilliseconds | null;
  stoppedSince: EpochMilliseconds | null;
  breakRegisteredForCurrentStop: boolean;
  preWarningIssued: boolean;
  breakReminderIssued: boolean;
}

export type DriveTimerEvent =
  | { type: 'breakPreWarning'; at: EpochMilliseconds }
  | { type: 'breakReminder'; at: EpochMilliseconds }
  | { type: 'breakRegistered'; at: EpochMilliseconds; stoppedSince: EpochMilliseconds };

export interface DriveTimerUpdate {
  state: DriveTimerState;
  events: DriveTimerEvent[];
}

export function createDriveTimer(): DriveTimerState {
  return {
    movement: 'stopped',
    accumulatedDriving: 0,
    lastSampleAt: null,
    stoppedSince: null,
    breakRegisteredForCurrentStop: false,
    preWarningIssued: false,
    breakReminderIssued: false,
  };
}

export function isBreakOverdue(state: DriveTimerState): boolean {
  return state.breakReminderIssued;
}

function isValidSpeed(speedKmh: number): boolean {
  return Number.isFinite(speedKmh) && speedKmh >= 0;
}

export function classifyMovement(previous: MovementState, speedKmh: number): MovementState {
  if (!isValidSpeed(speedKmh)) {
    return previous;
  }
  if (speedKmh > MOVING_ABOVE_KMH) {
    return 'moving';
  }
  if (speedKmh < STOPPED_BELOW_KMH) {
    return 'stopped';
  }
  return previous;
}

function accumulateDriving(
  state: DriveTimerState,
  intervalStart: EpochMilliseconds,
  elapsed: Milliseconds,
  settings: DriveTimerSettings,
): DriveTimerUpdate {
  const before = state.accumulatedDriving;
  const after = before + elapsed;
  const preWarningThreshold = settings.breakReminderAfter - settings.breakPreWarningLead;
  const events: DriveTimerEvent[] = [];
  let { preWarningIssued, breakReminderIssued } = state;

  if (!preWarningIssued && after >= preWarningThreshold) {
    preWarningIssued = true;
    events.push({ type: 'breakPreWarning', at: intervalStart + Math.max(0, preWarningThreshold - before) });
  }
  if (!breakReminderIssued && after >= settings.breakReminderAfter) {
    breakReminderIssued = true;
    events.push({
      type: 'breakReminder',
      at: intervalStart + Math.max(0, settings.breakReminderAfter - before),
    });
  }

  return {
    state: { ...state, accumulatedDriving: after, preWarningIssued, breakReminderIssued },
    events,
  };
}

function registerBreakIfLongEnough(
  state: DriveTimerState,
  now: EpochMilliseconds,
  settings: DriveTimerSettings,
): DriveTimerUpdate {
  if (
    state.movement !== 'stopped' ||
    state.stoppedSince === null ||
    state.breakRegisteredForCurrentStop ||
    now - state.stoppedSince < settings.minimumBreak
  ) {
    return { state, events: [] };
  }
  return {
    state: {
      ...state,
      accumulatedDriving: 0,
      breakRegisteredForCurrentStop: true,
      preWarningIssued: false,
      breakReminderIssued: false,
    },
    events: [
      {
        type: 'breakRegistered',
        at: state.stoppedSince + settings.minimumBreak,
        stoppedSince: state.stoppedSince,
      },
    ],
  };
}

function applyMovementChange(
  state: DriveTimerState,
  sample: SpeedSample,
): DriveTimerState {
  const movement = classifyMovement(state.movement, sample.speedKmh);
  if (movement === state.movement) {
    return state;
  }
  if (movement === 'stopped') {
    return { ...state, movement, stoppedSince: sample.at, breakRegisteredForCurrentStop: false };
  }
  return { ...state, movement, stoppedSince: null, breakRegisteredForCurrentStop: false };
}

export function processSpeedSample(
  state: DriveTimerState,
  sample: SpeedSample,
  settings: DriveTimerSettings,
): DriveTimerUpdate {
  if (state.lastSampleAt !== null && sample.at < state.lastSampleAt) {
    return { state, events: [] };
  }

  const events: DriveTimerEvent[] = [];
  let current = state;

  if (current.lastSampleAt !== null && current.movement === 'moving') {
    const accumulated = accumulateDriving(
      current,
      current.lastSampleAt,
      sample.at - current.lastSampleAt,
      settings,
    );
    current = accumulated.state;
    events.push(...accumulated.events);
  }

  const breakCheck = registerBreakIfLongEnough(current, sample.at, settings);
  current = breakCheck.state;
  events.push(...breakCheck.events);

  current = applyMovementChange({ ...current, lastSampleAt: sample.at }, sample);

  return { state: current, events };
}
