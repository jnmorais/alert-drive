import { hours, minutes, seconds } from '../core/duration';
import type { Milliseconds } from '../core/types';

export function formatDuration(duration: Milliseconds): string {
  const sign = duration < 0 ? '-' : '';
  let remaining = Math.abs(duration);
  const wholeHours = Math.floor(remaining / hours(1));
  remaining -= hours(wholeHours);
  const wholeMinutes = Math.floor(remaining / minutes(1));
  remaining -= minutes(wholeMinutes);
  const secondsPart = Math.round((remaining / seconds(1)) * 1000) / 1000;
  const parts: string[] = [];
  if (wholeHours > 0) {
    parts.push(`${wholeHours} h`);
  }
  if (wholeMinutes > 0) {
    parts.push(`${wholeMinutes} min`);
  }
  if (secondsPart > 0 || parts.length === 0) {
    parts.push(`${String(secondsPart).replace('.', ',')} s`);
  }
  return sign + parts.join(' ');
}
