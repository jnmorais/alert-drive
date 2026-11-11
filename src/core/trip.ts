import {
  type AlertChannelState,
  type ChannelChangeError,
  type ConfigurableChannel,
  createTripAlertChannels,
  setChannelEnabled,
  toggleSilence,
} from './alertChannels';
import {
  type CheckIntervalContext,
  type CheckIntervalSelection,
  type CheckSchedulerState,
  createCheckScheduler,
  localHourAt,
  markCheckResolved,
  processScheduleTick,
  type ReducedIntervalReason,
  selectCheckInterval,
} from './checkScheduler';
import {
  createDriveTimer,
  type DriveTimerEvent,
  type DriveTimerState,
  isBreakOverdue,
  type MovementState,
  processSpeedSample,
  type SpeedSample,
} from './driveTimer';
import {
  acknowledge,
  advanceEscalation,
  type AlertStage,
  type EscalationOutcome,
  type EscalationState,
  isEscalationActive,
  nextStageDueAt,
  startEscalation,
} from './escalation';
import type { ProfileSettings } from './profiles';
import {
  createRecurrenceTracker,
  recordEscalationResult,
  type RecurrenceState,
  registerBreak,
} from './recurrence';
import type { EpochMilliseconds, Milliseconds, VehicleType } from './types';

export interface TripConfig {
  vehicleType: VehicleType;
  settings: ProfileSettings;
  utcOffsetMinutes: number;
  startedAt: EpochMilliseconds;
}

export interface TripState {
  config: TripConfig;
  driveTimer: DriveTimerState;
  scheduler: CheckSchedulerState;
  escalation: EscalationState | null;
  recurrence: RecurrenceState;
  channels: AlertChannelState;
  lastUpdateAt: EpochMilliseconds;
}

export type TripEffect =
  | DriveTimerEvent
  | { type: 'checkStarted'; at: EpochMilliseconds; interval: Milliseconds; reasons: ReducedIntervalReason[] }
  | { type: 'stageEntered'; at: EpochMilliseconds; stage: AlertStage }
  | { type: 'checkResolved'; at: EpochMilliseconds; outcome: EscalationOutcome }
  | { type: 'stopRecommended'; at: EpochMilliseconds }
  | { type: 'emissionDelay'; at: EpochMilliseconds; stage: AlertStage; delay: Milliseconds };

export interface TripUpdate {
  trip: TripState;
  effects: TripEffect[];
}

export function startTrip(config: TripConfig): TripState {
  return {
    config,
    driveTimer: createDriveTimer(),
    scheduler: createCheckScheduler(),
    escalation: null,
    recurrence: createRecurrenceTracker(),
    channels: createTripAlertChannels(),
    lastUpdateAt: config.startedAt,
  };
}

export function isCheckActive(trip: TripState): boolean {
  return trip.escalation !== null && isEscalationActive(trip.escalation);
}

export function currentMovement(trip: TripState): MovementState {
  return trip.driveTimer.movement;
}

function intervalContext(trip: TripState, at: EpochMilliseconds): CheckIntervalContext {
  return {
    localHour: localHourAt(at, trip.config.utcOffsetMinutes),
    breakOverdue: isBreakOverdue(trip.driveTimer),
    recurrentEpisodesReduction: trip.recurrence.reducedIntervalActive,
  };
}

export function currentCheckInterval(trip: TripState, at: EpochMilliseconds): CheckIntervalSelection {
  return selectCheckInterval(trip.config.settings, intervalContext(trip, at));
}

function advanceActiveCheck(trip: TripState, at: EpochMilliseconds): TripUpdate {
  if (trip.escalation === null) {
    return { trip, effects: [] };
  }
  const { state, transitions } = advanceEscalation(trip.escalation, at, trip.config.settings);
  return {
    trip: { ...trip, escalation: state },
    effects: transitions.map((transition) => ({
      type: 'stageEntered' as const,
      at: transition.dueAt,
      stage: transition.stage,
    })),
  };
}

function applyDriveTimerEvents(trip: TripState, events: DriveTimerEvent[]): TripState {
  const breakRegistered = events.some((event) => event.type === 'breakRegistered');
  return breakRegistered ? { ...trip, recurrence: registerBreak() } : trip;
}

function runScheduler(trip: TripState, at: EpochMilliseconds): TripUpdate {
  const { state, check } = processScheduleTick(
    trip.scheduler,
    { at, movement: currentMovement(trip), context: intervalContext(trip, at) },
    trip.config.settings,
  );
  const scheduled = { ...trip, scheduler: state };
  if (check === null) {
    return { trip: scheduled, effects: [] };
  }
  const started = { ...scheduled, escalation: startEscalation(check.at) };
  const advanced = advanceActiveCheck(started, at);
  return {
    trip: advanced.trip,
    effects: [
      { type: 'checkStarted', at: check.at, interval: check.interval, reasons: check.reasons },
      ...advanced.effects,
    ],
  };
}

function isStale(trip: TripState, at: EpochMilliseconds): boolean {
  return at < trip.lastUpdateAt;
}

export function processTripSpeedSample(trip: TripState, sample: SpeedSample): TripUpdate {
  if (isStale(trip, sample.at)) {
    return { trip, effects: [] };
  }
  const checkProgress = advanceActiveCheck(trip, sample.at);
  const timed = processSpeedSample(checkProgress.trip.driveTimer, sample, trip.config.settings);
  const withDriving = applyDriveTimerEvents(
    { ...checkProgress.trip, driveTimer: timed.state },
    timed.events,
  );
  const scheduled = runScheduler(withDriving, sample.at);
  return {
    trip: { ...scheduled.trip, lastUpdateAt: sample.at },
    effects: [...checkProgress.effects, ...timed.events, ...scheduled.effects],
  };
}

export function advanceTripTime(trip: TripState, at: EpochMilliseconds): TripUpdate {
  if (isStale(trip, at)) {
    return { trip, effects: [] };
  }
  const checkProgress = advanceActiveCheck(trip, at);
  const scheduled = runScheduler(checkProgress.trip, at);
  return {
    trip: { ...scheduled.trip, lastUpdateAt: at },
    effects: [...checkProgress.effects, ...scheduled.effects],
  };
}

export function respondToCheck(trip: TripState, at: EpochMilliseconds): TripUpdate {
  if (trip.escalation === null || !isCheckActive(trip)) {
    return { trip, effects: [] };
  }
  const result = acknowledge(trip.escalation, at, trip.config.settings);
  if (result.outcome === null) {
    return { trip, effects: [] };
  }
  const recurrence = recordEscalationResult(trip.recurrence, result.outcome.maxStage);
  const effects: TripEffect[] = [
    ...result.transitions.map((transition) => ({
      type: 'stageEntered' as const,
      at: transition.dueAt,
      stage: transition.stage,
    })),
    { type: 'checkResolved', at, outcome: result.outcome },
  ];
  if (recurrence.recommendImmediateStop) {
    effects.push({ type: 'stopRecommended', at });
  }
  return {
    trip: {
      ...trip,
      escalation: result.state,
      scheduler: markCheckResolved(trip.scheduler, at),
      recurrence: recurrence.state,
      lastUpdateAt: Math.max(trip.lastUpdateAt, at),
    },
    effects,
  };
}

function projectedCheckAt(trip: TripState): EpochMilliseconds | null {
  const { scheduler } = trip;
  if (scheduler.phase !== 'counting' || currentMovement(trip) !== 'moving' || scheduler.lastTickAt === null) {
    return null;
  }
  const { interval } = currentCheckInterval(trip, scheduler.lastTickAt);
  return scheduler.lastTickAt + Math.max(0, interval - scheduler.movingSinceLastCheck);
}

export function nextTripDeadline(trip: TripState): EpochMilliseconds | null {
  if (trip.escalation !== null && isCheckActive(trip)) {
    return nextStageDueAt(trip.escalation, trip.config.settings);
  }
  return projectedCheckAt(trip);
}

export type TripChannelResult =
  | { ok: true; trip: TripState }
  | { ok: false; error: ChannelChangeError };

function withChannels(
  trip: TripState,
  result: ReturnType<typeof setChannelEnabled>,
): TripChannelResult {
  return result.ok ? { ok: true, trip: { ...trip, channels: result.state } } : result;
}

export function changeTripChannel(
  trip: TripState,
  channel: ConfigurableChannel,
  enabled: boolean,
): TripChannelResult {
  return withChannels(trip, setChannelEnabled(trip.channels, channel, enabled));
}

export function toggleTripSilence(trip: TripState): TripChannelResult {
  return withChannels(trip, toggleSilence(trip.channels));
}
