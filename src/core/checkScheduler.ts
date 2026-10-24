import type { MovementState } from './driveTimer';
import { hours, minutes } from './duration';
import type { ProfileSettings } from './profiles';
import type { EpochMilliseconds, Milliseconds } from './types';

export const NIGHT_START_HOUR = 0;
export const NIGHT_END_HOUR = 6;

const HOURS_PER_DAY = 24;

export type ReducedIntervalReason = 'night' | 'breakOverdue' | 'recurrentEpisodes';

export interface CheckIntervalContext {
  localHour: number;
  breakOverdue: boolean;
  recurrentEpisodesReduction: boolean;
}

export interface CheckIntervalSelection {
  interval: Milliseconds;
  reasons: ReducedIntervalReason[];
}

export type CheckIntervalSettings = Pick<
  ProfileSettings,
  'daytimeCheckInterval' | 'reducedCheckInterval'
>;

export function localHourAt(at: EpochMilliseconds, utcOffsetMinutes: number): number {
  const day = hours(HOURS_PER_DAY);
  const localTimeOfDay = (((at + minutes(utcOffsetMinutes)) % day) + day) % day;
  return Math.floor(localTimeOfDay / hours(1));
}

export function isNightTime(localHour: number): boolean {
  return localHour >= NIGHT_START_HOUR && localHour < NIGHT_END_HOUR;
}

export function selectCheckInterval(
  settings: CheckIntervalSettings,
  context: CheckIntervalContext,
): CheckIntervalSelection {
  const reasons: ReducedIntervalReason[] = [];
  if (isNightTime(context.localHour)) {
    reasons.push('night');
  }
  if (context.breakOverdue) {
    reasons.push('breakOverdue');
  }
  if (context.recurrentEpisodesReduction) {
    reasons.push('recurrentEpisodes');
  }
  if (reasons.length === 0) {
    return { interval: settings.daytimeCheckInterval, reasons };
  }
  return {
    interval: Math.min(settings.daytimeCheckInterval, settings.reducedCheckInterval),
    reasons,
  };
}

export type SchedulerPhase = 'counting' | 'awaitingResponse';

export interface CheckSchedulerState {
  phase: SchedulerPhase;
  movement: MovementState;
  lastTickAt: EpochMilliseconds | null;
  movingSinceLastCheck: Milliseconds;
}

export interface ScheduleTick {
  at: EpochMilliseconds;
  movement: MovementState;
  context: CheckIntervalContext;
}

export interface ScheduledCheck {
  at: EpochMilliseconds;
  interval: Milliseconds;
  reasons: ReducedIntervalReason[];
}

export interface ScheduleUpdate {
  state: CheckSchedulerState;
  check: ScheduledCheck | null;
}

export function createCheckScheduler(): CheckSchedulerState {
  return {
    phase: 'counting',
    movement: 'stopped',
    lastTickAt: null,
    movingSinceLastCheck: 0,
  };
}

function movingSegmentStart(state: CheckSchedulerState): EpochMilliseconds | null {
  return state.movement === 'moving' ? state.lastTickAt : null;
}

export function processScheduleTick(
  state: CheckSchedulerState,
  tick: ScheduleTick,
  settings: CheckIntervalSettings,
): ScheduleUpdate {
  if (state.lastTickAt !== null && tick.at < state.lastTickAt) {
    return { state, check: null };
  }

  const advanced: CheckSchedulerState = {
    ...state,
    movement: tick.movement,
    lastTickAt: tick.at,
  };

  if (state.phase === 'awaitingResponse') {
    return { state: advanced, check: null };
  }

  const segmentStart = movingSegmentStart(state);
  const elapsedMoving = segmentStart === null ? 0 : tick.at - segmentStart;
  const movingSinceLastCheck = state.movingSinceLastCheck + elapsedMoving;
  const selection = selectCheckInterval(settings, tick.context);

  if (tick.movement !== 'moving' || movingSinceLastCheck < selection.interval) {
    return { state: { ...advanced, movingSinceLastCheck }, check: null };
  }

  return {
    state: { ...advanced, phase: 'awaitingResponse', movingSinceLastCheck: 0 },
    check: {
      at:
        segmentStart === null || state.movingSinceLastCheck >= selection.interval
          ? tick.at
          : segmentStart + (selection.interval - state.movingSinceLastCheck),
      interval: selection.interval,
      reasons: selection.reasons,
    },
  };
}

export function markCheckResolved(
  state: CheckSchedulerState,
  at: EpochMilliseconds,
): CheckSchedulerState {
  if (state.lastTickAt === null || at >= state.lastTickAt) {
    return { ...state, phase: 'counting', movingSinceLastCheck: 0, lastTickAt: at };
  }
  return {
    ...state,
    phase: 'counting',
    movingSinceLastCheck: state.movement === 'moving' ? state.lastTickAt - at : 0,
  };
}
