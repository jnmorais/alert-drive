import { describe, expect, it } from '@jest/globals';

import { minutes, seconds } from '../core/duration';
import { getDefaultSettings } from '../core/profiles';
import { buildTripLog } from '../core/tripLog';
import type { CompletedTrip } from '../state/tripController';
import {
  checkLine,
  emissionDelayLine,
  formatEmissionDelay,
  formatLocalDateTime,
  formatLocalTime,
  HISTORY_STATUS_NOTES,
  tripSummaryLines,
  tripTitle,
} from './historyText';

const START = Date.UTC(2026, 9, 24, 12, 5);
const OFFSET = -180;

function completedTrip(overrides: Partial<CompletedTrip> = {}): CompletedTrip {
  return {
    config: { vehicleType: 'truck', settings: getDefaultSettings('truck'), utcOffsetMinutes: OFFSET, startedAt: START },
    simulationMode: false,
    endedAt: START + minutes(61) + seconds(30),
    effects: [],
    ...overrides,
  };
}

describe('RF12 - data, hora e perfil de cada viagem no histórico', () => {
  it('mostra a hora local do aparelho', () => {
    expect(formatLocalTime(START, OFFSET)).toBe('09:05');
    expect(formatLocalDateTime(START, OFFSET)).toBe('24/10/2026 09:05');
  });

  it('usa o dia local mesmo quando o dia em UTC já mudou', () => {
    expect(formatLocalDateTime(Date.UTC(2026, 9, 25, 1, 30), OFFSET)).toBe('24/10/2026 22:30');
  });

  it('identifica o perfil, o início e a simulação', () => {
    expect(tripTitle(completedTrip())).toBe('Caminhão · 24/10/2026 09:05');
    expect(tripTitle(completedTrip({ simulationMode: true }))).toBe('Caminhão · 24/10/2026 09:05 · Simulação');
  });
});

describe('RF12 - resumo de cada viagem no histórico', () => {
  it('resume uma viagem sem eventos', () => {
    expect(tripSummaryLines(completedTrip(), buildTripLog([]))).toEqual([
      'Duração: 1 h 1 min',
      'Verificações: 0',
      'Tempo médio de resposta: sem respostas',
      'Etapa máxima: nenhuma',
      'Pausas registradas: 0',
    ]);
  });

  it('resume verificações, respostas, pausas e recomendações de parada', () => {
    const log = buildTripLog([
      { type: 'checkStarted', at: START, interval: minutes(10), reasons: [] },
      {
        type: 'checkResolved',
        at: START + seconds(32),
        outcome: { respondedAt: START + seconds(32), responseTime: seconds(32), maxStage: 'mandatory', simulatedLevel: 8 },
      },
      { type: 'stopRecommended', at: START + seconds(32) },
      { type: 'breakRegistered', at: START + minutes(40), stoppedSince: START + minutes(10) },
    ]);
    expect(tripSummaryLines(completedTrip(), log)).toEqual([
      'Duração: 1 h 1 min',
      'Verificações: 1',
      'Tempo médio de resposta: 32 s',
      'Etapa máxima: Etapa 2 – Obrigatória',
      'Pausas registradas: 1',
      'Recomendações de parada: 1',
    ]);
  });
});

describe('RF12 - tempo médio de resposta arredondado no histórico', () => {
  function answered(responseTime: number, index: number) {
    const at = START + minutes(15) * index;
    return [
      { type: 'checkStarted' as const, at, interval: minutes(15), reasons: [] },
      {
        type: 'checkResolved' as const,
        at: at + responseTime,
        outcome: { respondedAt: at + responseTime, responseTime, maxStage: 'check' as const, simulatedLevel: 6 },
      },
    ];
  }

  it('mostra a média com no máximo uma casa decimal', () => {
    const log = buildTripLog([...answered(seconds(5), 0), ...answered(seconds(5), 1), ...answered(seconds(31), 2)]);
    expect(tripSummaryLines(completedTrip(), log)[2]).toBe('Tempo médio de resposta: 13,7 s');
  });

  it('mostra a média inteira sem casa decimal', () => {
    const log = buildTripLog([...answered(seconds(4), 0), ...answered(seconds(6), 1)]);
    expect(tripSummaryLines(completedTrip(), log)[2]).toBe('Tempo médio de resposta: 5 s');
  });
});

describe('RF12 - linha de cada verificação no histórico', () => {
  it('mostra hora, tempo até a resposta e etapa máxima', () => {
    expect(
      checkLine({ startedAt: START, interval: minutes(10), reasons: [], maxStage: 'check', responseTime: seconds(4) }, OFFSET),
    ).toBe('09:05 · resposta em 4 s · Verificação');
  });

  it('mostra a verificação sem resposta e o motivo do intervalo reduzido', () => {
    expect(
      checkLine(
        { startedAt: START, interval: minutes(5), reasons: ['night'], maxStage: 'maximum', responseTime: null },
        OFFSET,
      ),
    ).toBe('09:05 · sem resposta · Etapa 3 – Máxima (madrugada)');
  });
});

describe('RNF05 - atraso dos alertas no resumo da viagem', () => {
  it('mostra o maior atraso medido e a meta de menos de 1 s', () => {
    const trip = completedTrip({
      effects: [
        { type: 'emissionDelay', at: START, stage: 'check', delay: 8.6 },
        { type: 'emissionDelay', at: START + seconds(15), stage: 'preventive', delay: 41 },
      ],
    });
    expect(tripSummaryLines(trip, buildTripLog(trip.effects)).at(-1)).toBe(
      'Atraso dos alertas: máx. 41 ms (meta: menos de 1 s)',
    );
  });

  it('conta os atrasos acima da meta e mostra os atrasos longos em segundos', () => {
    expect(emissionDelayLine({ count: 3, maximum: seconds(1.26), average: 500, overTarget: 2 })).toBe(
      'Atraso dos alertas: máx. 1,3 s (meta: menos de 1 s) · 2 acima da meta',
    );
    expect(formatEmissionDelay(999.4)).toBe('999 ms');
  });

  it('não mostra a linha em viagens sem medição', () => {
    expect(tripSummaryLines(completedTrip(), buildTripLog([])).some((line) => line.startsWith('Atraso'))).toBe(false);
  });
});

describe('RF12 - situação da gravação do histórico', () => {
  it('diz que o histórico fica só no aparelho e avisa quando não pôde ser gravado', () => {
    expect(HISTORY_STATUS_NOTES.saved).toBe('O histórico fica gravado só neste aparelho.');
    expect(HISTORY_STATUS_NOTES.memoryOnly).toContain('vale só enquanto o app estiver aberto');
    expect(HISTORY_STATUS_NOTES.loading).toBe('Carregando o histórico…');
  });
});
