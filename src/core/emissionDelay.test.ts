import { describe, expect, it } from '@jest/globals';

import { minutes, seconds } from './duration';
import {
  emissionDelaysOf,
  measureEmissionDelays,
  RNF05_DELAY_TARGET,
  summarizeEmissionDelays,
} from './emissionDelay';
import type { TripEffect } from './trip';

const DUE = Date.UTC(2026, 10, 10, 12, 0);
const sameSpeed = (delay: number) => delay;

describe('RNF05 - atraso entre o horário previsto e a emissão do alerta', () => {
  it('mede a verificação e cada etapa pela diferença entre o horário previsto e o da emissão', () => {
    const effects: TripEffect[] = [
      { type: 'checkStarted', at: DUE, interval: minutes(10), reasons: [] },
      { type: 'stageEntered', at: DUE + seconds(15), stage: 'preventive' },
    ];
    expect(measureEmissionDelays(effects, DUE + seconds(15) + 40, sameSpeed)).toEqual([
      { type: 'emissionDelay', at: DUE, stage: 'check', delay: seconds(15) + 40 },
      { type: 'emissionDelay', at: DUE + seconds(15), stage: 'preventive', delay: 40 },
    ]);
  });

  it('na simulação acelerada, converte o atraso para o tempo real', () => {
    const effects: TripEffect[] = [{ type: 'stageEntered', at: DUE, stage: 'mandatory' }];
    expect(measureEmissionDelays(effects, DUE + seconds(6), (delay) => delay / 60)).toEqual([
      { type: 'emissionDelay', at: DUE, stage: 'mandatory', delay: 100 },
    ]);
  });

  it('não mede os demais eventos, não registra atraso negativo e ignora a simulação pausada', () => {
    expect(measureEmissionDelays([{ type: 'stopRecommended', at: DUE }], DUE + 50, sameSpeed)).toEqual([]);
    expect(measureEmissionDelays([{ type: 'stageEntered', at: DUE, stage: 'maximum' }], DUE - 5, sameSpeed)).toEqual([
      { type: 'emissionDelay', at: DUE, stage: 'maximum', delay: 0 },
    ]);
    expect(
      measureEmissionDelays([{ type: 'stageEntered', at: DUE, stage: 'maximum' }], DUE + 5, () => Number.POSITIVE_INFINITY),
    ).toEqual([]);
  });
});

describe('RNF05 - resumo dos atrasos medidos na viagem', () => {
  it('resume a quantidade, o máximo, a média e quantos passaram da meta de 1 s', () => {
    const effects: TripEffect[] = [
      { type: 'checkStarted', at: DUE, interval: minutes(10), reasons: [] },
      { type: 'emissionDelay', at: DUE, stage: 'check', delay: 20 },
      { type: 'emissionDelay', at: DUE + seconds(15), stage: 'preventive', delay: 40 },
      { type: 'emissionDelay', at: DUE + seconds(30), stage: 'mandatory', delay: seconds(1) },
    ];
    expect(RNF05_DELAY_TARGET).toBe(seconds(1));
    expect(emissionDelaysOf(effects)).toHaveLength(3);
    expect(summarizeEmissionDelays(effects)).toEqual({ count: 3, maximum: 1000, average: 1060 / 3, overTarget: 1 });
  });

  it('não há resumo sem medições', () => {
    expect(summarizeEmissionDelays([])).toBeNull();
  });
});
