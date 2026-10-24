import type { Clock } from '../core/types';

export function deviceUtcOffsetMinutes(clock: Clock): number {
  return -new Date(clock.now()).getTimezoneOffset();
}
