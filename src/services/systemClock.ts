import type { Clock } from '../core/types';

export const systemClock: Clock = {
  now: () => Date.now(),
};
