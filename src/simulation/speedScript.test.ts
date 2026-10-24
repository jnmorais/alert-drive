import { describe, expect, it } from '@jest/globals';

import { minutes, seconds } from '../core/duration';
import type { SpeedSegment } from './scenarios';
import { nextSampleOffset, scriptDuration, speedAt, stepStartHour } from './speedScript';

const SCRIPT: SpeedSegment[] = [
  { duration: minutes(10), speedKmh: 80 },
  { duration: minutes(15), speedKmh: 0 },
  { duration: minutes(5), speedKmh: 60 },
];

describe('RF14 - roteiro de velocidade da simulação ao vivo', () => {
  it('soma a duração dos trechos', () => {
    expect(scriptDuration(SCRIPT)).toBe(minutes(30));
    expect(scriptDuration([])).toBe(0);
  });

  it('dá a velocidade do trecho em andamento', () => {
    expect(speedAt(SCRIPT, 0)).toBe(80);
    expect(speedAt(SCRIPT, minutes(9))).toBe(80);
    expect(speedAt(SCRIPT, minutes(12))).toBe(0);
    expect(speedAt(SCRIPT, minutes(29))).toBe(60);
  });

  it('usa a velocidade do trecho seguinte exatamente na troca de trecho', () => {
    expect(speedAt(SCRIPT, minutes(10))).toBe(0);
    expect(speedAt(SCRIPT, minutes(25))).toBe(60);
  });

  it('mantém a velocidade do último trecho depois do fim do roteiro', () => {
    expect(speedAt(SCRIPT, minutes(30))).toBe(60);
    expect(speedAt(SCRIPT, minutes(40))).toBe(60);
  });

  it('fica parado num roteiro vazio', () => {
    expect(speedAt([], 0)).toBe(0);
  });

  it('agenda a próxima leitura um passo adiante dentro do trecho', () => {
    expect(nextSampleOffset(SCRIPT, minutes(1), seconds(30))).toBe(minutes(1) + seconds(30));
  });

  it('agenda a próxima leitura exatamente na troca de trecho', () => {
    expect(nextSampleOffset(SCRIPT, minutes(9) + seconds(50), seconds(30))).toBe(minutes(10));
    expect(nextSampleOffset(SCRIPT, minutes(10), seconds(30))).toBe(minutes(10) + seconds(30));
  });

  it('agenda a última leitura exatamente no fim do roteiro', () => {
    expect(nextSampleOffset(SCRIPT, minutes(29) + seconds(50), seconds(30))).toBe(minutes(30));
  });

  it('não agenda leitura depois do fim do roteiro', () => {
    expect(nextSampleOffset(SCRIPT, minutes(30), seconds(30))).toBeNull();
    expect(nextSampleOffset([], 0, seconds(30))).toBeNull();
  });
});

describe('RF14 - horário de início configurável', () => {
  it('avança e recua uma hora', () => {
    expect(stepStartHour(9, 'increase')).toBe(10);
    expect(stepStartHour(9, 'decrease')).toBe(8);
  });

  it('dá a volta no relógio para testar a madrugada', () => {
    expect(stepStartHour(23, 'increase')).toBe(0);
    expect(stepStartHour(0, 'decrease')).toBe(23);
  });
});
