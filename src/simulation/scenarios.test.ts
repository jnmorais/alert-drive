import { describe, expect, it } from '@jest/globals';

import { localHourAt } from '../core/checkScheduler';
import { hours, minutes, seconds } from '../core/duration';
import { VEHICLE_TYPES } from '../core/types';
import { formatDuration } from './format';
import {
  findScenario,
  runScenario,
  type Scenario,
  SCENARIOS,
  SIMULATION_UTC_OFFSET_MINUTES,
} from './scenarios';

function scenario(id: string): Scenario {
  const found = findScenario(id);
  if (!found) {
    throw new Error(`Cenário ${id} não encontrado`);
  }
  return found;
}

describe('RF14 - catálogo de cenários de simulação', () => {
  it('tem os seis cenários da especificação, com título e resultado esperado', () => {
    expect(SCENARIOS.map((item) => item.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
    for (const item of SCENARIOS) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.expectedOutcome.length).toBeGreaterThan(0);
    }
  });

  it('não encontra cenário inexistente', () => {
    expect(findScenario('S9')).toBeUndefined();
  });
});

describe.each(SCENARIOS.map((item) => [item.id, item.title, item] as const))(
  'RF14 - cenário %s: %s',
  (_id, _title, item) => {
    it.each(VEHICLE_TYPES)('perfil %s atinge todos os resultados esperados', (vehicleType) => {
      const run = runScenario(item, vehicleType);
      const expectations = item.verify(run);
      expect(expectations.length).toBeGreaterThan(0);
      expect(expectations.filter((expectation) => !expectation.passed)).toEqual([]);
    });
  },
);

describe('RF14 - a conferência dos cenários detecta resultados errados', () => {
  it('a conferência do S1 reprova uma viagem em que o motorista para de responder', () => {
    const run = runScenario(scenario('S2'), 'truck');
    const failed = scenario('S1').verify(run).filter((expectation) => !expectation.passed);
    expect(failed.map((expectation) => expectation.description)).toContain(
      'verificações com escalonamento',
    );
  });

  it('a conferência do S5 reprova uma viagem diurna', () => {
    const run = runScenario(scenario('S1'), 'car');
    expect(scenario('S5').verify(run).some((expectation) => !expectation.passed)).toBe(true);
  });

  it('a conferência do S4 reprova uma viagem sem pausas', () => {
    const run = runScenario(scenario('S1'), 'car');
    const results = scenario('S4').verify(run);
    expect(results.some((expectation) => !expectation.passed)).toBe(true);
    expect(results.every((expectation) => expectation.actual.length > 0)).toBe(true);
  });

  it('a conferência do S6 reprova uma viagem sem episódios graves', () => {
    const run = runScenario(scenario('S1'), 'bus');
    const results = scenario('S6').verify(run);
    expect(results.find((expectation) => expectation.description.startsWith('recomendação emitida'))).toMatchObject({
      actual: 'nenhuma',
      passed: false,
    });
  });

  it('a conferência do S2 reprova uma viagem em que o motorista sempre responde', () => {
    const run = runScenario(scenario('S1'), 'truck');
    expect(scenario('S2').verify(run).some((expectation) => !expectation.passed)).toBe(true);
  });

  it('a conferência do S3 reprova uma viagem curta', () => {
    const run = runScenario(scenario('S1'), 'truck');
    const results = scenario('S3').verify(run);
    expect(results.find((expectation) => expectation.description === 'lembrete de pausa emitido após')).toMatchObject({
      actual: 'nenhum',
      passed: false,
    });
  });

  it('a conferência do S2 informa ausência de verificações', () => {
    const run = runScenario(scenario('S4'), 'car', { settings: { ...runScenario(scenario('S1'), 'car').settings, daytimeCheckInterval: hours(10) } });
    const results = scenario('S2').verify(run);
    expect(results.find((expectation) => expectation.description.startsWith('horários'))?.actual).toBe('nenhum');
  });
});

describe('RF14 - conferências escritas em português para o relatório', () => {
  it('a etapa final do S2 aparece com o nome do Quadro 1', () => {
    const results = scenario('S2').verify(runScenario(scenario('S2'), 'car'));
    expect(results.find((expectation) => expectation.description === 'etapa final')).toMatchObject({
      expected: 'Etapa 3 – Máxima',
      actual: 'Etapa 3 – Máxima',
    });
  });

  it('as etapas dos episódios do S6 aparecem com o nome do Quadro 1', () => {
    const results = scenario('S6').verify(runScenario(scenario('S6'), 'bus'));
    expect(
      results.find((expectation) => expectation.description === 'etapa máxima dos dois primeiros episódios'),
    ).toMatchObject({
      expected: 'Etapa 2 – Obrigatória, Etapa 2 – Obrigatória',
      actual: 'Etapa 2 – Obrigatória, Etapa 2 – Obrigatória',
    });
  });

  it('etapa ausente aparece como "nenhuma"', () => {
    const run = runScenario(scenario('S4'), 'car', {
      settings: { ...runScenario(scenario('S1'), 'car').settings, daytimeCheckInterval: hours(10) },
    });
    const results = scenario('S2').verify(run);
    expect(results.find((expectation) => expectation.description === 'etapa final')?.actual).toBe('nenhuma');
  });
});

describe('RF14 - execução dos cenários', () => {
  it('o cenário de madrugada começa à 01h no horário de Brasília', () => {
    const run = runScenario(scenario('S5'), 'truck');
    expect(localHourAt(run.startedAt, SIMULATION_UTC_OFFSET_MINUTES)).toBe(1);
  });

  it('registra o tempo de resposta e a etapa máxima de cada verificação', () => {
    const run = runScenario(scenario('S6'), 'truck');
    expect(run.checks[0]?.outcome).toMatchObject({ responseTime: seconds(31), maxStage: 'mandatory' });
  });

  it('aceita parâmetros personalizados e passo de simulação maior', () => {
    const base = runScenario(scenario('S1'), 'car');
    const run = runScenario(scenario('S1'), 'car', {
      settings: { ...base.settings, daytimeCheckInterval: minutes(5) },
      step: seconds(5),
    });
    expect(run.checks.every((check) => check.interval === minutes(5))).toBe(true);
    expect(run.endedAt - run.startedAt).toBe(minutes(61));
  });
});

describe('Formatação de durações para o relatório', () => {
  it.each([
    [0, '0 s'],
    [seconds(15), '15 s'],
    [seconds(1.5), '1,5 s'],
    [minutes(5), '5 min'],
    [hours(5.5), '5 h 30 min'],
    [hours(1) + minutes(2) + seconds(3), '1 h 2 min 3 s'],
    [-seconds(2), '-2 s'],
  ])('%d ms vira "%s"', (value, expected) => {
    expect(formatDuration(value)).toBe(expected);
  });
});
