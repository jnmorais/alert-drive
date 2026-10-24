import { describe, expect, it } from '@jest/globals';

import { minutes, seconds } from './duration';
import { getDefaultSettings } from './profiles';
import { processTripSpeedSample, respondToCheck, startTrip, type TripEffect, type TripState } from './trip';
import { averageResponseTime, buildTripLog, highestStageInLog } from './tripLog';

const START = Date.UTC(2026, 9, 24, 13, 0);
const CHECK_AT = START + minutes(15);

function drive(trip: TripState, until: number, effects: TripEffect[]): TripState {
  let current = trip;
  for (let at = current.lastUpdateAt; at <= until; at += seconds(1)) {
    const update = processTripSpeedSample(current, { at, speedKmh: 80 });
    current = update.trip;
    effects.push(...update.effects);
  }
  return current;
}

function newTrip(): TripState {
  return startTrip({ vehicleType: 'car', settings: getDefaultSettings('car'), utcOffsetMinutes: -180, startedAt: START });
}

describe('RF12 - registro de cada verificação da viagem', () => {
  it('registra horário, intervalo, tempo até a resposta e etapa máxima de uma verificação respondida', () => {
    const effects: TripEffect[] = [];
    const trip = drive(newTrip(), CHECK_AT + seconds(4), effects);
    effects.push(...respondToCheck(trip, CHECK_AT + seconds(4)).effects);
    expect(buildTripLog(effects).checks).toEqual([
      { startedAt: CHECK_AT, interval: minutes(15), reasons: [], maxStage: 'check', responseTime: seconds(4) },
    ]);
  });

  it('registra a etapa alcançada por uma verificação ainda sem resposta', () => {
    const effects: TripEffect[] = [];
    drive(newTrip(), CHECK_AT + seconds(35), effects);
    expect(buildTripLog(effects).checks[0]).toMatchObject({ maxStage: 'mandatory', responseTime: null });
  });

  it('registra a etapa máxima de uma resposta tardia', () => {
    const effects: TripEffect[] = [];
    const trip = drive(newTrip(), CHECK_AT + seconds(50), effects);
    effects.push(...respondToCheck(trip, CHECK_AT + seconds(50)).effects);
    expect(buildTripLog(effects).checks[0]).toMatchObject({ maxStage: 'maximum', responseTime: seconds(50) });
  });

  it('ignora etapa ou resposta sem verificação aberta', () => {
    const log = buildTripLog([
      { type: 'stageEntered', at: START, stage: 'preventive' },
      {
        type: 'checkResolved',
        at: START,
        outcome: { respondedAt: START, responseTime: 0, maxStage: 'check', simulatedLevel: 6 },
      },
    ]);
    expect(log.checks).toEqual([]);
  });

  it('não rebaixa a etapa máxima se uma etapa menor chegar depois', () => {
    const log = buildTripLog([
      { type: 'checkStarted', at: START, interval: minutes(15), reasons: [] },
      { type: 'stageEntered', at: START + seconds(30), stage: 'mandatory' },
      { type: 'stageEntered', at: START + seconds(15), stage: 'preventive' },
    ]);
    expect(log.checks[0]?.maxStage).toBe('mandatory');
  });
});

describe('RF12 - registro de pausas e avisos da viagem', () => {
  it('registra pausas, pré-avisos, lembretes e recomendações de parada', () => {
    const log = buildTripLog([
      { type: 'breakPreWarning', at: START + minutes(105) },
      { type: 'breakReminder', at: START + minutes(120) },
      { type: 'stopRecommended', at: START + minutes(125) },
      { type: 'breakRegistered', at: START + minutes(145), stoppedSince: START + minutes(130) },
    ]);
    expect(log.breakPreWarnings).toEqual([START + minutes(105)]);
    expect(log.breakReminders).toEqual([START + minutes(120)]);
    expect(log.stopRecommendations).toEqual([START + minutes(125)]);
    expect(log.breaks).toEqual([{ stoppedSince: START + minutes(130), registeredAt: START + minutes(145) }]);
  });

  it('começa vazio numa viagem sem eventos', () => {
    const log = buildTripLog([]);
    expect(log).toEqual({ checks: [], breaks: [], breakPreWarnings: [], breakReminders: [], stopRecommendations: [] });
    expect(highestStageInLog(log)).toBeNull();
    expect(averageResponseTime(log)).toBeNull();
  });
});

describe('RF12 - resumo da viagem para o histórico', () => {
  const log = buildTripLog([
    { type: 'checkStarted', at: START, interval: minutes(15), reasons: [] },
    {
      type: 'checkResolved',
      at: START + seconds(4),
      outcome: { respondedAt: START + seconds(4), responseTime: seconds(4), maxStage: 'check', simulatedLevel: 6 },
    },
    { type: 'checkStarted', at: START + minutes(15), interval: minutes(15), reasons: [] },
    {
      type: 'checkResolved',
      at: START + minutes(15) + seconds(32),
      outcome: {
        respondedAt: START + minutes(15) + seconds(32),
        responseTime: seconds(32),
        maxStage: 'mandatory',
        simulatedLevel: 8,
      },
    },
    { type: 'checkStarted', at: START + minutes(30), interval: minutes(15), reasons: [] },
  ]);

  it('identifica a etapa mais alta da viagem', () => {
    expect(highestStageInLog(log)).toBe('mandatory');
  });

  it('calcula a média só das verificações respondidas', () => {
    expect(averageResponseTime(log)).toBe(seconds(18));
  });
});
