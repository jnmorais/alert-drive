import { describe, expect, it } from '@jest/globals';

import { hours, minutes, seconds } from '../core/duration';
import { SCENARIOS } from '../simulation/scenarios';
import {
  autoResponseValue,
  formatStartTime,
  progressText,
  scenarioOptionLabel,
  scriptLengthNote,
  SIMULATION_STATUS_LABELS,
  speedFactorLabel,
  speedText,
} from './simulationText';

describe('RF14 - textos da tela de simulação', () => {
  it('explica o fator de aceleração em segundos reais', () => {
    expect(speedFactorLabel(1)).toBe('Tempo real');
    expect(speedFactorLabel(10)).toBe('10× (1 s = 10 s)');
    expect(speedFactorLabel(60)).toBe('60× (1 s = 1 min)');
    expect(speedFactorLabel(300)).toBe('300× (1 s = 5 min)');
  });

  it('mostra o horário de início com dois dígitos', () => {
    expect(formatStartTime(1, 0)).toBe('01:00');
    expect(formatStartTime(14, 5)).toBe('14:05');
  });

  it('identifica cada roteiro pelo código e pelo título', () => {
    expect(scenarioOptionLabel(SCENARIOS[0]!)).toBe('S1 – Motorista responde sempre rápido');
  });

  it('mostra a duração simulada e a duração real aproximada', () => {
    expect(scriptLengthNote(minutes(61), 60)).toBe('Duração: 1 h 1 min simulados, cerca de 1 min 1 s reais.');
    expect(scriptLengthNote(hours(6), 300)).toBe('Duração: 6 h simulados, cerca de 1 min 12 s reais.');
    expect(scriptLengthNote(seconds(90), 60)).toBe('Duração: 1 min 30 s simulados, cerca de 2 s reais.');
  });

  it('mostra o progresso do roteiro', () => {
    expect(
      progressText({ status: 'running', elapsed: minutes(35), duration: minutes(61), speedKmh: 80, speedFactor: 60 }),
    ).toBe('35 min de 1 h 1 min');
  });

  it('mostra a velocidade do roteiro', () => {
    expect(speedText(80)).toBe('80 km/h');
    expect(speedText(null)).toBe('–');
  });

  it('diz quem responde às verificações', () => {
    expect(autoResponseValue(true)).toBe('Do roteiro');
    expect(autoResponseValue(false)).toBe('Pelo toque');
  });

  it('descreve cada situação da simulação', () => {
    expect(SIMULATION_STATUS_LABELS.finished).toBe('Roteiro concluído. Veículo parado.');
  });
});
