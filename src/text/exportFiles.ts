import { minutes } from '../core/duration';
import type { EpochMilliseconds } from '../core/types';

export const UTF8_BYTE_ORDER_MARK = '﻿';

export const CSV_MIME_TYPE = 'text/csv';
export const TEXT_MIME_TYPE = 'text/plain';

export interface ExportFile {
  fileName: string;
  content: string;
  mimeType: string;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function exportFileName(
  baseName: string,
  at: EpochMilliseconds,
  utcOffsetMinutes: number,
  extension: string,
): string {
  const local = new Date(at + minutes(utcOffsetMinutes));
  const date = `${local.getUTCFullYear()}-${twoDigits(local.getUTCMonth() + 1)}-${twoDigits(local.getUTCDate())}`;
  return `${baseName}-${date}-${twoDigits(local.getUTCHours())}${twoDigits(local.getUTCMinutes())}.${extension}`;
}
