import { describe, expect, it } from '@jest/globals';

import { seconds } from '../core/duration';
import { createAllScenarioReports, type ScenarioReport } from '../simulation/report';
import {
  approvalLabel,
  groupReports,
  overallResultText,
  runScenariosLabel,
} from './scenarioResultsText';

const reports = createAllScenarioReports({ step: seconds(5) });

function withFailure(report: ScenarioReport): ScenarioReport {
  return {
    ...report,
    approved: false,
    expectations: [
      ...report.expectations,
      { description: 'verificações com escalonamento', expected: '0', actual: '2', passed: false },
    ],
  };
}

describe('RF14 - resultado dos cenários automáticos na tela', () => {
  it('descreve o botão com o número de cenários e perfis', () => {
    expect(runScenariosLabel(6, 3)).toBe('Rodar os 6 cenários nos 3 perfis');
  });

  it('conta as execuções aprovadas', () => {
    expect(overallResultText(reports)).toBe('18 de 18 execuções aprovadas');
    expect(overallResultText([withFailure(reports[0]!), ...reports.slice(1)])).toBe('17 de 18 execuções aprovadas');
  });

  it('agrupa os resultados por cenário, com os três perfis em cada um', () => {
    const groups = groupReports(reports);
    expect(groups.map((group) => group.scenarioId)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
    expect(groups[0]?.title).toBe('Motorista responde sempre rápido');
    expect(groups[0]?.results.map((result) => result.label)).toEqual(['Caminhão', 'Ônibus', 'Automóvel']);
    expect(groups.every((group) => group.results.every((result) => result.approved && result.failures.length === 0))).toBe(
      true,
    );
  });

  it('mostra o que falhou numa execução reprovada', () => {
    const [group] = groupReports([withFailure(reports[0]!)]);
    expect(group?.results[0]).toMatchObject({
      approved: false,
      failures: ['verificações com escalonamento: esperado 0, obtido 2'],
    });
  });

  it('usa rótulos curtos para aprovado e reprovado', () => {
    expect(approvalLabel(true)).toBe('Aprovado');
    expect(approvalLabel(false)).toBe('Reprovado');
  });
});
