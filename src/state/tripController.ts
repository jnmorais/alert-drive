import type { ChannelChangeError, ConfigurableChannel } from '../core/alertChannels';
import { measureEmissionDelays } from '../core/emissionDelay';
import type { ProfileSettings } from '../core/profiles';
import type { ResponseContext, ResponseMethod } from '../core/responsePolicy';
import {
  advanceTripTime,
  changeTripChannel,
  isCheckActive,
  nextTripDeadline,
  processTripSpeedSample,
  respondToCheck,
  startTrip,
  type TripChannelResult,
  type TripConfig,
  type TripEffect,
  type TripState,
  type TripUpdate,
  toggleTripSilence,
} from '../core/trip';
import type { Clock, EpochMilliseconds, Milliseconds, VehicleType } from '../core/types';
import type { ResponseProvider } from '../services/response/ResponseProvider';
import { createTouchResponseProvider } from '../services/response/touchResponse';

export type CancelTimer = () => void;

export interface TimerScheduler {
  schedule(callback: () => void, delay: Milliseconds): CancelTimer;
}

export interface StartTripParams {
  vehicleType: VehicleType;
  settings: ProfileSettings;
  utcOffsetMinutes: number;
  clock: Clock;
  simulationMode: boolean;
  toRealDelay?: (simulatedDelay: Milliseconds) => Milliseconds;
}

export interface CompletedTrip {
  config: TripConfig;
  simulationMode: boolean;
  endedAt: EpochMilliseconds;
  effects: TripEffect[];
}

export interface TripSnapshot {
  trip: TripState | null;
  simulationMode: boolean;
  effects: TripEffect[];
  completedTrips: CompletedTrip[];
}

export type EffectsListener = (effects: TripEffect[], snapshot: TripSnapshot) => void;

export interface TripControllerOptions {
  timers: TimerScheduler;
  createResponseProviders?: (clock: Clock) => ResponseProvider[];
}

export interface TripController {
  getSnapshot(): TripSnapshot;
  subscribe(listener: () => void): () => void;
  subscribeEffects(listener: EffectsListener): () => void;
  start(params: StartTripParams): void;
  end(): void;
  pushSpeedSample(speedKmh: number, at?: EpochMilliseconds): void;
  respond(at?: EpochMilliseconds): void;
  setChannel(channel: ConfigurableChannel, enabled: boolean): ChannelChangeError | null;
  toggleSilence(): ChannelChangeError | null;
  reschedule(): void;
  responseProvider(method: ResponseMethod): ResponseProvider | undefined;
  responseContext(): ResponseContext | null;
}

interface RunningTrip {
  clock: Clock;
  toRealDelay: (simulatedDelay: Milliseconds) => Milliseconds;
  providers: ResponseProvider[];
}

const EMPTY_SNAPSHOT: TripSnapshot = {
  trip: null,
  simulationMode: false,
  effects: [],
  completedTrips: [],
};

function defaultResponseProviders(clock: Clock): ResponseProvider[] {
  return [createTouchResponseProvider(clock)];
}

function sameSpeed(simulatedDelay: Milliseconds): Milliseconds {
  return simulatedDelay;
}

export function createTripController({
  timers,
  createResponseProviders = defaultResponseProviders,
}: TripControllerOptions): TripController {
  let snapshot = EMPTY_SNAPSHOT;
  let running: RunningTrip | null = null;
  let cancelTimer: CancelTimer | null = null;
  const listeners = new Set<() => void>();
  const effectsListeners = new Set<EffectsListener>();

  function publish(next: TripSnapshot, newEffects: TripEffect[]): void {
    snapshot = next;
    listeners.forEach((listener) => listener());
    if (newEffects.length > 0) {
      effectsListeners.forEach((listener) => listener(newEffects, snapshot));
    }
  }

  function clearTimer(): void {
    cancelTimer?.();
    cancelTimer = null;
  }

  function syncResponseListening(trip: TripState, providers: ResponseProvider[]): void {
    const active = isCheckActive(trip);
    for (const provider of providers) {
      if (active && !provider.isListening()) {
        provider.start((response) => respond(response.at));
      } else if (!active && provider.isListening()) {
        provider.stop();
      }
    }
  }

  function apply(update: TripUpdate, current: RunningTrip): void {
    syncResponseListening(update.trip, current.providers);
    const effects = [
      ...update.effects,
      ...measureEmissionDelays(update.effects, current.clock.now(), current.toRealDelay),
    ];
    publish({ ...snapshot, trip: update.trip, effects: [...snapshot.effects, ...effects] }, effects);
    reschedule();
  }

  function reschedule(): void {
    clearTimer();
    const trip = snapshot.trip;
    if (running === null || trip === null) {
      return;
    }
    const deadline = nextTripDeadline(trip);
    if (deadline === null) {
      return;
    }
    const { clock, toRealDelay } = running;
    const realDelay = toRealDelay(Math.max(0, deadline - clock.now()));
    if (!Number.isFinite(realDelay)) {
      return;
    }
    cancelTimer = timers.schedule(() => {
      cancelTimer = null;
      const current = snapshot.trip;
      if (running === null || current === null) {
        return;
      }
      const now = running.clock.now();
      if (now < deadline) {
        reschedule();
        return;
      }
      apply(advanceTripTime(current, now), running);
    }, realDelay);
  }

  function end(): void {
    clearTimer();
    const trip = snapshot.trip;
    if (running === null || trip === null) {
      return;
    }
    running.providers.forEach((provider) => provider.stop());
    const completed: CompletedTrip = {
      config: trip.config,
      simulationMode: snapshot.simulationMode,
      endedAt: running.clock.now(),
      effects: snapshot.effects,
    };
    running = null;
    publish(
      { trip: null, simulationMode: false, effects: [], completedTrips: [...snapshot.completedTrips, completed] },
      [],
    );
  }

  function respond(at?: EpochMilliseconds): void {
    if (running === null || snapshot.trip === null) {
      return;
    }
    apply(respondToCheck(snapshot.trip, at ?? running.clock.now()), running);
  }

  function applyChannelResult(result: TripChannelResult): ChannelChangeError | null {
    if (!result.ok) {
      return result.error;
    }
    publish({ ...snapshot, trip: result.trip }, []);
    return null;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeEffects(listener) {
      effectsListeners.add(listener);
      return () => effectsListeners.delete(listener);
    },
    start(params) {
      end();
      running = {
        clock: params.clock,
        toRealDelay: params.toRealDelay ?? sameSpeed,
        providers: createResponseProviders(params.clock),
      };
      const trip = startTrip({
        vehicleType: params.vehicleType,
        settings: params.settings,
        utcOffsetMinutes: params.utcOffsetMinutes,
        startedAt: params.clock.now(),
      });
      publish({ ...snapshot, trip, simulationMode: params.simulationMode, effects: [] }, []);
    },
    end,
    pushSpeedSample(speedKmh, at) {
      if (running === null || snapshot.trip === null) {
        return;
      }
      apply(processTripSpeedSample(snapshot.trip, { at: at ?? running.clock.now(), speedKmh }), running);
    },
    respond,
    setChannel(channel, enabled) {
      if (snapshot.trip === null) {
        return null;
      }
      return applyChannelResult(changeTripChannel(snapshot.trip, channel, enabled));
    },
    toggleSilence() {
      if (snapshot.trip === null) {
        return null;
      }
      return applyChannelResult(toggleTripSilence(snapshot.trip));
    },
    reschedule,
    responseProvider: (method) => running?.providers.find((provider) => provider.method === method),
    responseContext() {
      if (snapshot.trip === null) {
        return null;
      }
      return { movement: snapshot.trip.driveTimer.movement, simulationMode: snapshot.simulationMode };
    },
  };
}

export const browserTimers: TimerScheduler = {
  schedule(callback, delay) {
    const handle = setTimeout(callback, delay);
    return () => clearTimeout(handle);
  },
};
