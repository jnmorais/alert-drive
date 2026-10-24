import type { Milliseconds } from './types';

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

export function seconds(amount: number): Milliseconds {
  return amount * MILLISECONDS_PER_SECOND;
}

export function minutes(amount: number): Milliseconds {
  return seconds(amount * SECONDS_PER_MINUTE);
}

export function hours(amount: number): Milliseconds {
  return minutes(amount * MINUTES_PER_HOUR);
}
