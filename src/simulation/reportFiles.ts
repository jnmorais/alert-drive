import type { EpochMilliseconds } from '../core/types';
import { formatLocalDateTimeWithSeconds } from '../text/historyCsv';
import { CSV_MIME_TYPE, exportFileName, type ExportFile, TEXT_MIME_TYPE, UTF8_BYTE_ORDER_MARK } from '../text/exportFiles';
import { buildCsv, buildOverallSummaryText, formatUtcOffset, type ScenarioReport } from './report';

export type ScenarioReportKind = 'csv' | 'summary';

const REPORT_BASE_NAME = 'alert-drive-cenarios';

export function scenarioReportFile(
  reports: readonly ScenarioReport[],
  kind: ScenarioReportKind,
  at: EpochMilliseconds,
  utcOffsetMinutes: number,
): ExportFile {
  if (kind === 'csv') {
    return {
      fileName: exportFileName(REPORT_BASE_NAME, at, utcOffsetMinutes, 'csv'),
      content: UTF8_BYTE_ORDER_MARK + buildCsv([...reports]),
      mimeType: CSV_MIME_TYPE,
    };
  }
  const generatedAt = `Gerado em ${formatLocalDateTimeWithSeconds(at, utcOffsetMinutes)} (${formatUtcOffset(utcOffsetMinutes)})`;
  return {
    fileName: exportFileName(REPORT_BASE_NAME, at, utcOffsetMinutes, 'txt'),
    content: `${generatedAt}\n\n${buildOverallSummaryText([...reports])}`,
    mimeType: TEXT_MIME_TYPE,
  };
}
