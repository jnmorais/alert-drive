import type { ProfileSettings } from '../core/profiles';
import type { TripConfig, TripEffect } from '../core/trip';
import type { Clock, EpochMilliseconds, Milliseconds, VehicleType } from '../core/types';
import { type AcceleratedClock, createAcceleratedClock, DEFAULT_SPEED_FACTOR } from '../simulation/clock';
import { type Responder, type SpeedSegment, STOPPED_SPEED_KMH } from '../simulation/scenarios';
import { nextSampleOffset, scriptDuration, speedAt } from '../simulation/speedScript';
import type { CancelTimer, TimerScheduler, TripController } from './tripController';

export const SAMPLE_REAL_INTERVAL: Milliseconds = 500;

export type SimulationStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface SimulationProgress {
  status: SimulationStatus;
  elapsed: Milliseconds;
  duration: Milliseconds;
  speedKmh: number | null;
  speedFactor: number;
}

export interface SimulationSetup {
  vehicleType: VehicleType;
  settings: ProfileSettings;
  segments: readonly SpeedSegment[];
  startAt: EpochMilliseconds;
  utcOffsetMinutes: number;
  speedFactor: number;
  responder: Responder | null;
}

export interface SimulationRunnerOptions {
  controller: TripController;
  timers: TimerScheduler;
  realClock: Clock;
  sampleInterval?: Milliseconds;
}

export interface SimulationRunner {
  getSnapshot(): SimulationProgress;
  subscribe(listener: () => void): () => void;
  start(setup: SimulationSetup): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

interface ActiveRun {
  setup: SimulationSetup;
  clock: AcceleratedClock;
  config: TripConfig | undefined;
  duration: Milliseconds;
  checkCount: number;
  pendingResponseAt: EpochMilliseconds | null;
  cancelSample: CancelTimer | null;
  cancelResponse: CancelTimer | null;
  unsubscribe: (() => void)[];
}

const IDLE: SimulationProgress = {
  status: 'idle',
  elapsed: 0,
  duration: 0,
  speedKmh: null,
  speedFactor: DEFAULT_SPEED_FACTOR,
};

export function createSimulationRunner({
  controller,
  timers,
  realClock,
  sampleInterval = SAMPLE_REAL_INTERVAL,
}: SimulationRunnerOptions): SimulationRunner {
  let progress = IDLE;
  let run: ActiveRun | null = null;
  const listeners = new Set<() => void>();

  function publish(next: SimulationProgress): void {
    progress = next;
    listeners.forEach((listener) => listener());
  }

  function elapsedOf(current: ActiveRun): Milliseconds {
    return Math.min(current.duration, current.clock.now() - current.setup.startAt);
  }

  function cancelTimers(current: ActiveRun): void {
    current.cancelSample?.();
    current.cancelSample = null;
    current.cancelResponse?.();
    current.cancelResponse = null;
  }

  function detach(): ActiveRun | null {
    const current = run;
    if (current !== null) {
      cancelTimers(current);
      current.unsubscribe.forEach((unsubscribe) => unsubscribe());
      run = null;
    }
    return current;
  }

  function scheduleResponse(current: ActiveRun): void {
    current.cancelResponse?.();
    current.cancelResponse = null;
    const respondAt = current.pendingResponseAt;
    if (respondAt === null || current.clock.isPaused()) {
      return;
    }
    current.cancelResponse = timers.schedule(() => {
      current.cancelResponse = null;
      current.pendingResponseAt = null;
      controller.respond(respondAt);
    }, current.clock.toRealDelay(respondAt - current.clock.now()));
  }

  function handleEffects(current: ActiveRun, effects: TripEffect[]): void {
    for (const effect of effects) {
      if (effect.type !== 'checkStarted') {
        continue;
      }
      const delay = current.setup.responder?.(current.checkCount) ?? null;
      current.checkCount += 1;
      if (delay !== null) {
        current.pendingResponseAt = effect.at + delay;
        scheduleResponse(current);
      }
    }
  }

  function pushAtPlannedTime(current: ActiveRun, offset: Milliseconds, speedKmh: number): void {
    const plannedAt = current.setup.startAt + offset;
    const lastUpdateAt = controller.getSnapshot().trip?.lastUpdateAt ?? plannedAt;
    controller.pushSpeedSample(speedKmh, Math.max(plannedAt, lastUpdateAt));
  }

  function finish(current: ActiveRun): void {
    pushAtPlannedTime(current, current.duration, STOPPED_SPEED_KMH);
    publish({ ...progress, status: 'finished', elapsed: current.duration, speedKmh: STOPPED_SPEED_KMH });
  }

  function sample(current: ActiveRun, elapsed: Milliseconds): void {
    current.cancelSample = null;
    const speedKmh = speedAt(current.setup.segments, elapsed);
    pushAtPlannedTime(current, elapsed, speedKmh);
    const next = nextSampleOffset(current.setup.segments, elapsed, sampleInterval * current.clock.speedFactor());
    if (next === null) {
      finish(current);
      return;
    }
    publish({ ...progress, status: 'running', elapsed, speedKmh });
    const delay = current.clock.toRealDelay(current.setup.startAt + next - current.clock.now());
    current.cancelSample = timers.schedule(() => sample(current, next), delay);
  }

  function followTrip(current: ActiveRun): void {
    if (controller.getSnapshot().trip?.config !== current.config) {
      detach();
      publish(IDLE);
    }
  }

  function stop(): void {
    if (detach() === null) {
      return;
    }
    controller.end();
    publish(IDLE);
  }

  return {
    getSnapshot: () => progress,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start(setup) {
      stop();
      const clock = createAcceleratedClock({
        realClock,
        simulatedStartAt: setup.startAt,
        speedFactor: setup.speedFactor,
      });
      controller.start({
        vehicleType: setup.vehicleType,
        settings: setup.settings,
        utcOffsetMinutes: setup.utcOffsetMinutes,
        clock,
        simulationMode: true,
        toRealDelay: clock.toRealDelay,
      });
      const current: ActiveRun = {
        setup,
        clock,
        config: controller.getSnapshot().trip?.config,
        duration: scriptDuration(setup.segments),
        checkCount: 0,
        pendingResponseAt: null,
        cancelSample: null,
        cancelResponse: null,
        unsubscribe: [],
      };
      run = current;
      current.unsubscribe.push(
        controller.subscribe(() => followTrip(current)),
        controller.subscribeEffects((effects) => handleEffects(current, effects)),
      );
      publish({
        status: 'running',
        elapsed: 0,
        duration: current.duration,
        speedKmh: null,
        speedFactor: setup.speedFactor,
      });
      sample(current, elapsedOf(current));
    },
    pause() {
      const current = run;
      if (current === null || progress.status !== 'running') {
        return;
      }
      current.clock.pause();
      cancelTimers(current);
      controller.reschedule();
      publish({ ...progress, status: 'paused', elapsed: elapsedOf(current) });
    },
    resume() {
      const current = run;
      if (current === null || progress.status !== 'paused') {
        return;
      }
      current.clock.resume();
      controller.reschedule();
      scheduleResponse(current);
      sample(current, elapsedOf(current));
    },
    stop,
  };
}
