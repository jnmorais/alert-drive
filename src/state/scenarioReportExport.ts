import type { EpochMilliseconds } from '../core/types';
import type { ScenarioReport } from '../simulation/report';
import { type ScenarioReportKind, scenarioReportFile } from '../simulation/reportFiles';

export type ScenarioReportExportResult = 'shared' | 'failed';

export type ShareTextFile = (fileName: string, content: string, mimeType: string) => Promise<void>;

export interface ExportScenarioReportParams {
  reports: readonly ScenarioReport[];
  kind: ScenarioReportKind;
  at: EpochMilliseconds;
  utcOffsetMinutes: number;
  share: ShareTextFile;
}

export async function exportScenarioReport({
  reports,
  kind,
  at,
  utcOffsetMinutes,
  share,
}: ExportScenarioReportParams): Promise<ScenarioReportExportResult> {
  const file = scenarioReportFile(reports, kind, at, utcOffsetMinutes);
  try {
    await share(file.fileName, file.content, file.mimeType);
    return 'shared';
  } catch {
    return 'failed';
  }
}
