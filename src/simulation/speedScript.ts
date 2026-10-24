import type { StepDirection } from '../core/settingsEditing';
import type { Milliseconds } from '../core/types';
import { type SpeedSegment, STOPPED_SPEED_KMH } from './scenarios';

const HOURS_PER_DAY = 24;

export function scriptDuration(segments: readonly SpeedSegment[]): Milliseconds {
  return segments.reduce((total, segment) => total + segment.duration, 0);
}

function segmentEnds(segments: readonly SpeedSegment[]): Milliseconds[] {
  let end = 0;
  return segments.map((segment) => (end += segment.duration));
}

export function speedAt(segments: readonly SpeedSegment[], elapsed: Milliseconds): number {
  const ends = segmentEnds(segments);
  const index = ends.findIndex((end) => elapsed < end);
  const segment = index === -1 ? segments[segments.length - 1] : segments[index];
  return segment?.speedKmh ?? STOPPED_SPEED_KMH;
}

export function nextSampleOffset(
  segments: readonly SpeedSegment[],
  elapsed: Milliseconds,
  maxStep: Milliseconds,
): Milliseconds | null {
  const nextBoundary = segmentEnds(segments).find((end) => end > elapsed);
  return nextBoundary === undefined ? null : Math.min(elapsed + maxStep, nextBoundary);
}

export function stepStartHour(hour: number, direction: StepDirection): number {
  const delta = direction === 'increase' ? 1 : -1;
  return (hour + delta + HOURS_PER_DAY) % HOURS_PER_DAY;
}
