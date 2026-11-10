import type { EpochMilliseconds } from '../core/types';
import { buildHistoryCsvFile } from '../text/historyCsv';
import type { CompletedTrip } from './tripController';

export type HistoryExportResult = 'shared' | 'empty' | 'failed';

export type ShareCsvFile = (fileName: string, content: string) => Promise<void>;

export interface ExportTripHistoryParams {
  trips: readonly CompletedTrip[];
  at: EpochMilliseconds;
  utcOffsetMinutes: number;
  share: ShareCsvFile;
}

export async function exportTripHistory({
  trips,
  at,
  utcOffsetMinutes,
  share,
}: ExportTripHistoryParams): Promise<HistoryExportResult> {
  if (trips.length === 0) {
    return 'empty';
  }
  const file = buildHistoryCsvFile(trips, at, utcOffsetMinutes);
  try {
    await share(file.fileName, file.content);
    return 'shared';
  } catch {
    return 'failed';
  }
}
