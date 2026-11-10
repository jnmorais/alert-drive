import { seconds } from './duration';
import type { EpochMilliseconds, Milliseconds } from './types';

export interface LocationReading {
  at: EpochMilliseconds;
  speedMetersPerSecond: number | null;
}

export const KMH_PER_METER_PER_SECOND = 3.6;

export const GPS_SIGNAL_TIMEOUT: Milliseconds = seconds(10);

export function speedKmhFromReading(reading: LocationReading): number | null {
  const speed = reading.speedMetersPerSecond;
  if (speed === null || !Number.isFinite(speed) || speed < 0) {
    return null;
  }
  return speed * KMH_PER_METER_PER_SECOND;
}
