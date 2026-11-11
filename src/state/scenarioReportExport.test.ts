import { describe, expect, it } from '@jest/globals';

import { seconds } from '../core/duration';
import { createScenarioReport } from '../simulation/report';
import { scenarioReportFile } from '../simulation/reportFiles';
import { SCENARIOS } from '../simulation/scenarios';
import { exportScenarioReport } from './scenarioReportExport';

const reports = [createScenarioReport(SCENARIOS[0]!, 'car', { step: seconds(5) })];
const AT = Date.UTC(2026, 10, 10, 4, 5);
const OFFSET = -180;

describe('RF14 - exportação do relatório dos cenários pelo aparelho', () => {
  it('entrega o CSV e o resumo para o compartilhamento do aparelho', async () => {
    const shared: { fileName: string; content: string; mimeType: string }[] = [];
    const share = async (fileName: string, content: string, mimeType: string) => {
      shared.push({ fileName, content, mimeType });
    };
    expect(await exportScenarioReport({ reports, kind: 'csv', at: AT, utcOffsetMinutes: OFFSET, share })).toBe('shared');
    expect(await exportScenarioReport({ reports, kind: 'summary', at: AT, utcOffsetMinutes: OFFSET, share })).toBe(
      'shared',
    );
    expect(shared).toEqual([
      scenarioReportFile(reports, 'csv', AT, OFFSET),
      scenarioReportFile(reports, 'summary', AT, OFFSET),
    ]);
  });

  it('informa a falha quando o aparelho não consegue gravar ou compartilhar', async () => {
    const result = await exportScenarioReport({
      reports,
      kind: 'csv',
      at: AT,
      utcOffsetMinutes: OFFSET,
      share: async () => {
        throw new Error('compartilhamento indisponível');
      },
    });
    expect(result).toBe('failed');
  });
});
