import type { TripState } from './trip';

export function shouldKeepScreenAwake(trip: TripState | null): boolean {
  return trip !== null;
}
