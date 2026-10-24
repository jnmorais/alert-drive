import type { CheckIntervalSelection } from './checkScheduler';
import type { MovementState } from './driveTimer';
import { isResponseMethodAllowed, type ResponseContext } from './responsePolicy';
import { currentCheckInterval, isCheckActive, nextTripDeadline, type TripState } from './trip';
import type { EpochMilliseconds, Milliseconds } from './types';

export type BreakPhase = 'normal' | 'preWarning' | 'overdue';

export type CheckPhase = 'waitingForMovement' | 'counting' | 'active';

export interface TripStatus {
  movement: MovementState;
  hasSpeedData: boolean;
  drivingTime: Milliseconds;
  breakPhase: BreakPhase;
  timeUntilBreakReminder: Milliseconds;
  stoppedFor: Milliseconds | null;
  breakRemaining: Milliseconds | null;
  checkPhase: CheckPhase;
  timeUntilNextCheck: Milliseconds | null;
  checkInterval: CheckIntervalSelection;
  stopRecommended: boolean;
}

function elapsedSince(start: EpochMilliseconds, at: EpochMilliseconds): Milliseconds {
  return Math.max(0, at - start);
}

function drivingTimeAt(trip: TripState, at: EpochMilliseconds): Milliseconds {
  const { accumulatedDriving, movement, lastSampleAt } = trip.driveTimer;
  if (movement !== 'moving' || lastSampleAt === null) {
    return accumulatedDriving;
  }
  return accumulatedDriving + elapsedSince(lastSampleAt, at);
}

function breakPhaseFor(trip: TripState, drivingTime: Milliseconds): BreakPhase {
  const { breakReminderAfter, breakPreWarningLead } = trip.config.settings;
  if (drivingTime >= breakReminderAfter) {
    return 'overdue';
  }
  return drivingTime >= breakReminderAfter - breakPreWarningLead ? 'preWarning' : 'normal';
}

function stoppedForAt(trip: TripState, at: EpochMilliseconds): Milliseconds | null {
  const { movement, stoppedSince } = trip.driveTimer;
  return movement === 'stopped' && stoppedSince !== null ? elapsedSince(stoppedSince, at) : null;
}

function breakRemainingFor(trip: TripState, stoppedFor: Milliseconds | null): Milliseconds | null {
  if (stoppedFor === null) {
    return null;
  }
  if (trip.driveTimer.breakRegisteredForCurrentStop) {
    return 0;
  }
  return Math.max(0, trip.config.settings.minimumBreak - stoppedFor);
}

function checkPhaseFor(trip: TripState): CheckPhase {
  if (isCheckActive(trip)) {
    return 'active';
  }
  return trip.driveTimer.movement === 'moving' ? 'counting' : 'waitingForMovement';
}

function timeUntilNextCheckFor(trip: TripState, phase: CheckPhase, at: EpochMilliseconds): Milliseconds | null {
  const deadline = phase === 'counting' ? nextTripDeadline(trip) : null;
  return deadline === null ? null : elapsedSince(at, deadline);
}

export function describeTripStatus(trip: TripState, at: EpochMilliseconds): TripStatus {
  const drivingTime = drivingTimeAt(trip, at);
  const stoppedFor = stoppedForAt(trip, at);
  const checkPhase = checkPhaseFor(trip);
  return {
    movement: trip.driveTimer.movement,
    hasSpeedData: trip.driveTimer.lastSampleAt !== null,
    drivingTime,
    breakPhase: breakPhaseFor(trip, drivingTime),
    timeUntilBreakReminder: Math.max(0, trip.config.settings.breakReminderAfter - drivingTime),
    stoppedFor,
    breakRemaining: breakRemainingFor(trip, stoppedFor),
    checkPhase,
    timeUntilNextCheck: timeUntilNextCheckFor(trip, checkPhase, at),
    checkInterval: currentCheckInterval(trip, at),
    stopRecommended: trip.recurrence.reducedIntervalActive,
  };
}

export function isTripEndAllowed(context: ResponseContext): boolean {
  return isResponseMethodAllowed('touch', context);
}
