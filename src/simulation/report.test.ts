import { describe, expect, it } from '@jest/globals';

import { minutes, seconds } from '../core/duration';
import { VEHICLE_TYPES } from '../core/types';
import { ALERT_STAGE_LABELS, REDUCED_INTERVAL_REASON_LABELS, VEHICLE_TYPE_LABELS } from '../text/labels';
import {
  buildCheckRows,
  buildCsv,
  buildOverallSummaryText,
  buildScenarioSummaryText,
  createAllScenarioReports,
  createScenarioReport,
  CSV_LINE_BREAK,
  escapeCsvField,
  formatDecimal,
  formatLocalClock,
  formatUtcOffset,
  NO_RESPONSE_LABEL,
  type ScenarioReport,
  summarize,
} from './report';
import { findScenario, type Scenario, SCENARIOS } from './scenarios';

function scenario(id: string): Scenario {
  const found = findScenario(id);
  if (!found) {
    throw new Error(`Cenário ${id} não encontrado`);
  }
  return found;
}

const reportS2Truck = createScenarioReport(scenario('S2'), 'truck');
const reportS6Bus = createScenarioReport(scenario('S6'), 'bus');

describe('RF14 - relatório: uma linha por verificação no CSV', () => {
  it('tem cabeçalho e uma linha para cada verificação', () => {
    const csv = buildCsv([reportS2Truck]);
    const lines = csv.split(CSV_LINE_BREAK).filter((line) => line.length > 0);
    expect(lines[0]).toBe(
      'cenario;perfil;verificacao;horario_simulado;tempo_de_viagem;intervalo_min;motivos_reducao;tempo_ate_resposta_s;etapa_maxima;nivel_simulado',
    );
    expect(lines).toHaveLength(1 + reportS2Truck.run.checks.length);
    expect(csv.endsWith(CSV_LINE_BREAK)).toBe(true);
  });

  it('registra o tempo até a resposta e a etapa máxima de cada verificação', () => {
    expect(buildCheckRows(reportS2Truck)).toEqual([
      ['S2', 'Caminhão', '1', '09:10:00', '10 min', '10', '', '5', 'Verificação', '6'],
      ['S2', 'Caminhão', '2', '09:20:05', '20 min 5 s', '10', '', '5', 'Verificação', '6'],
      ['S2', 'Caminhão', '3', '09:30:10', '30 min 10 s', '10', '', NO_RESPONSE_LABEL, 'Etapa 3 – Máxima', '9'],
    ]);
  });

  it('registra os motivos da redução do intervalo', () => {
    const rows = buildCheckRows(reportS6Bus);
    expect(rows[0]?.[8]).toBe('Etapa 2 – Obrigatória');
    expect(rows[0]?.[7]).toBe('26');
    expect(rows[2]?.[6]).toBe('Episódios recorrentes');
    expect(rows[2]?.[5]).toBe('5');
  });

  it('protege campos com separador, aspas ou quebra de linha', () => {
    expect(escapeCsvField('simples')).toBe('simples');
    expect(escapeCsvField('a;b')).toBe('"a;b"');
    expect(escapeCsvField('diz "ok"')).toBe('"diz ""ok"""');
    expect(escapeCsvField('linha\nnova')).toBe('"linha\nnova"');
  });
});

describe('RF14 - relatório: resumo de cada execução', () => {
  it('soma verificações, escalonamentos, respostas e eventos de pausa', () => {
    expect(summarize(reportS2Truck.run)).toEqual({
      checks: 3,
      escalatedChecks: 1,
      unansweredChecks: 1,
      answeredResponseTimes: [seconds(5), seconds(5)],
      highestStage: 'maximum',
      breaksRegistered: 0,
      breakPreWarnings: 0,
      breakReminders: 0,
      stopRecommendations: 0,
    });
  });

  it('conta pausas e recomendações de parada', () => {
    const summary = summarize(reportS6Bus.run);
    expect(summary.breaksRegistered).toBe(1);
    expect(summary.stopRecommendations).toBe(1);
    expect(summary.highestStage).toBe('mandatory');
  });

  it('o texto traz cenário, perfil, tempos de resposta, etapa máxima e a conferência', () => {
    const text = buildScenarioSummaryText(reportS2Truck);
    expect(text).toContain('Cenário S2 – Motorista para de responder | Perfil: Caminhão');
    expect(text).toContain('Início: 09:00:00 (UTC-3) | Duração simulada: 32 min');
    expect(text).toContain('Tempo até a resposta: média 5 s, máximo 5 s (2 respondidas)');
    expect(text).toContain('Etapa máxima atingida: Etapa 3 – Máxima');
    expect(text).toContain('APROVADO');
    expect(text).toContain('  [OK] verificações emitidas: esperado 3, obtido 3');
  });

  it('marca como reprovada a execução com alguma conferência falha', () => {
    const failing: ScenarioReport = {
      ...reportS2Truck,
      expectations: [{ description: 'exemplo', expected: '1', actual: '2', passed: false }],
      approved: false,
    };
    const text = buildScenarioSummaryText(failing);
    expect(text).toContain('Conferência: 0 de 1 aprovadas – REPROVADO');
    expect(text).toContain('  [FALHA] exemplo: esperado 1, obtido 2');
  });

  it('descreve uma execução sem nenhuma verificação', () => {
    const report = createScenarioReport(scenario('S1'), 'car', {
      settings: { ...reportS2Truck.run.settings, daytimeCheckInterval: minutes(120) },
    });
    const text = buildScenarioSummaryText(report);
    expect(summarize(report.run).highestStage).toBeNull();
    expect(text).toContain('Tempo até a resposta: nenhuma verificação respondida');
    expect(text).toContain('Etapa máxima atingida: nenhuma verificação');
  });
});

describe('RF14 - relatório geral dos seis cenários nos três perfis', () => {
  const reports = createAllScenarioReports();

  it('gera 18 execuções, todas aprovadas', () => {
    expect(reports).toHaveLength(SCENARIOS.length * VEHICLE_TYPES.length);
    expect(reports.filter((report) => !report.approved)).toEqual([]);
  });

  it('o resumo geral lista cada execução com o veredito', () => {
    const text = buildOverallSummaryText(reports);
    expect(text.startsWith('Relatório da simulação – Alert-Drive')).toBe(true);
    expect(text).toContain('Execuções: 18 | Aprovadas: 18 | Reprovadas: 0');
    expect(text).toContain('S5 | Ônibus | Viagem de madrugada | APROVADO');
  });

  it('o CSV geral reúne as verificações de todas as execuções', () => {
    const csv = buildCsv(reports);
    const total = reports.reduce((sum, report) => sum + report.run.checks.length, 0);
    expect(csv.split(CSV_LINE_BREAK).filter((line) => line.length > 0)).toHaveLength(total + 1);
  });
});

describe('Formatação dos valores do relatório', () => {
  it('formata o horário local simulado', () => {
    expect(formatLocalClock(Date.UTC(2026, 9, 24, 4, 5, 6), -180)).toBe('01:05:06');
    expect(formatLocalClock(Date.UTC(2026, 9, 24, 1, 0, 0), -180)).toBe('22:00:00');
  });

  it.each([
    [-180, 'UTC-3'],
    [0, 'UTC+0'],
    [330, 'UTC+5:30'],
    [-570, 'UTC-9:30'],
  ])('formata o fuso %i como %s', (offset, expected) => {
    expect(formatUtcOffset(offset)).toBe(expected);
  });

  it('usa vírgula decimal', () => {
    expect(formatDecimal(31)).toBe('31');
    expect(formatDecimal(1.25)).toBe('1,25');
    expect(formatDecimal(0.3333333)).toBe('0,333');
  });
});

describe('Textos em português da interface e do relatório', () => {
  it('nomeia os três perfis', () => {
    expect(VEHICLE_TYPE_LABELS).toEqual({ truck: 'Caminhão', bus: 'Ônibus', car: 'Automóvel' });
  });

  it('nomeia as etapas como no Quadro 1', () => {
    expect(Object.values(ALERT_STAGE_LABELS)).toEqual([
      'Verificação',
      'Etapa 1 – Preventiva',
      'Etapa 2 – Obrigatória',
      'Etapa 3 – Máxima',
    ]);
  });

  it('nomeia os motivos de redução do intervalo', () => {
    expect(Object.keys(REDUCED_INTERVAL_REASON_LABELS)).toEqual(['night', 'breakOverdue', 'recurrentEpisodes']);
  });
});
