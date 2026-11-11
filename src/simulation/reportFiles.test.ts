import { describe, expect, it } from '@jest/globals';

import { seconds } from '../core/duration';
import { UTF8_BYTE_ORDER_MARK } from '../text/exportFiles';
import { buildCsv, buildOverallSummaryText, createAllScenarioReports } from './report';
import { scenarioReportFile } from './reportFiles';

const reports = createAllScenarioReports({ step: seconds(5) });
const AT = Date.UTC(2026, 10, 10, 4, 5, 9);
const OFFSET = -180;

describe('RF14 - arquivos do relatório dos cenários', () => {
  it('o CSV traz uma linha por verificação dos 18 cenários, marcado como UTF-8', () => {
    const file = scenarioReportFile(reports, 'csv', AT, OFFSET);
    expect(reports).toHaveLength(18);
    expect(file.fileName).toBe('alert-drive-cenarios-2026-11-10-0105.csv');
    expect(file.mimeType).toBe('text/csv');
    expect(file.content).toBe(UTF8_BYTE_ORDER_MARK + buildCsv([...reports]));
    expect(file.content.split('\r\n')[0]).toBe(`${UTF8_BYTE_ORDER_MARK}cenario;perfil;verificacao;horario_simulado;tempo_de_viagem;intervalo_min;motivos_reducao;tempo_ate_resposta_s;etapa_maxima;nivel_simulado`);
  });

  it('o resumo em texto começa pela data em que foi gerado e traz o relatório completo', () => {
    const file = scenarioReportFile(reports, 'summary', AT, OFFSET);
    expect(file.fileName).toBe('alert-drive-cenarios-2026-11-10-0105.txt');
    expect(file.mimeType).toBe('text/plain');
    expect(file.content).toBe(`Gerado em 10/11/2026 01:05:09 (UTC-3)\n\n${buildOverallSummaryText([...reports])}`);
    expect(file.content).toContain('Execuções: 18 | Aprovadas: 18 | Reprovadas: 0');
  });
});
