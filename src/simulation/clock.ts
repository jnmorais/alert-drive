import { hours, minutes } from '../core/duration';
import type { Clock, EpochMilliseconds, Milliseconds } from '../core/types';

export const DEFAULT_SPEED_FACTOR = 60;
export const SPEED_FACTOR_PRESETS: readonly number[] = [1, 10, 60, 300];

const HOURS_PER_DAY = 24;

export interface AcceleratedClockOptions {
  realClock: Clock;
  simulatedStartAt: EpochMilliseconds;
  speedFactor?: number;
}

export interface AcceleratedClock extends Clock {
  speedFactor(): number;
  isPaused(): boolean;
  setSpeedFactor(speedFactor: number): void;
  pause(): void;
  resume(): void;
  toRealDelay(simulatedDelay: Milliseconds): Milliseconds;
}

export function isValidSpeedFactor(speedFactor: number): boolean {
  return Number.isFinite(speedFactor) && speedFactor > 0;
}

function assertValidSpeedFactor(speedFactor: number): void {
  if (!isValidSpeedFactor(speedFactor)) {
    throw new RangeError(`Fator de aceleração inválido: ${speedFactor}`);
  }
}

export function createAcceleratedClock({
  realClock,
  simulatedStartAt,
  speedFactor = DEFAULT_SPEED_FACTOR,
}: AcceleratedClockOptions): AcceleratedClock {
  assertValidSpeedFactor(speedFactor);
  let factor = speedFactor;
  let simulatedAnchor = simulatedStartAt;
  let realAnchor = realClock.now();
  let paused = false;

  function now(): EpochMilliseconds {
    if (paused) {
      return simulatedAnchor;
    }
    return simulatedAnchor + (realClock.now() - realAnchor) * factor;
  }

  function rebase(): void {
    simulatedAnchor = now();
    realAnchor = realClock.now();
  }

  return {
    now,
    speedFactor: () => factor,
    isPaused: () => paused,
    setSpeedFactor(nextFactor) {
      assertValidSpeedFactor(nextFactor);
      rebase();
      factor = nextFactor;
    },
    pause() {
      rebase();
      paused = true;
    },
    resume() {
      if (!paused) {
        return;
      }
      paused = false;
      realAnchor = realClock.now();
    },
    toRealDelay(simulatedDelay) {
      if (paused) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.max(0, simulatedDelay) / factor;
    },
  };
}

export function localTimeOnSameDay(
  reference: EpochMilliseconds,
  localHour: number,
  localMinute: number,
  utcOffsetMinutes: number,
): EpochMilliseconds {
  const day = hours(HOURS_PER_DAY);
  const offset = minutes(utcOffsetMinutes);
  const localReference = reference + offset;
  const localMidnight = localReference - (((localReference % day) + day) % day);
  return localMidnight + hours(localHour) + minutes(localMinute) - offset;
}
