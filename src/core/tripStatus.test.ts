import { describe, expect, it } from '@jest/globals';

import { hours, minutes, seconds } from './duration';
import { getDefaultSettings } from './profiles';
import { processTripSpeedSample, startTrip, type TripState } from './trip';
import { describeTripStatus, isTripEndAllowed } from './tripStatus';
import type { EpochMilliseconds, Milliseconds } from './types';

const BRASILIA_OFFSET = -180;
const MORNING = Date.UTC(2026, 9, 24, 13, 0);
const NIGHT = Date.UTC(2026, 9, 24, 5, 0);
const SAMPLE_STEP = seconds(30);

function newCarTrip(startedAt: EpochMilliseconds = MORNING): TripState {
  return startTrip({
    vehicleType: 'car',
    settings: getDefaultSettings('car'),
    utcOffsetMinutes: BRASILIA_OFFSET,
    startedAt,
  });
}

function hold(trip: TripState, from: Milliseconds, to: Milliseconds, speedKmh: number): TripState {
  let current = trip;
  for (let offset = from; offset <= to; offset += SAMPLE_STEP) {
    current = processTripSpeedSample(current, { at: MORNING + offset, speedKmh }).trip;
  }
  return current;
}

describe('RF03 - situação do tempo de direção na tela de viagem', () => {
  it('começa parada, sem dados de velocidade e sem tempo de direção', () => {
    const status = describeTripStatus(newCarTrip(), MORNING);
    expect(status.movement).toBe('stopped');
    expect(status.hasSpeedData).toBe(false);
    expect(status.drivingTime).toBe(0);
    expect(status.stoppedFor).toBeNull();
    expect(status.breakRemaining).toBeNull();
  });

  it('acumula o tempo de direção em movimento', () => {
    const trip = hold(newCarTrip(), 0, minutes(5), 80);
    const status = describeTripStatus(trip, MORNING + minutes(5));
    expect(status.hasSpeedData).toBe(true);
    expect(status.movement).toBe('moving');
    expect(status.drivingTime).toBe(minutes(5));
  });

  it('projeta o tempo de direção entre duas leituras de velocidade', () => {
    const trip = hold(newCarTrip(), 0, minutes(5), 80);
    expect(describeTripStatus(trip, MORNING + minutes(6)).drivingTime).toBe(minutes(6));
  });

  it('não usa um horário anterior à última leitura', () => {
    const trip = hold(newCarTrip(), 0, minutes(5), 80);
    expect(describeTripStatus(trip, MORNING + minutes(4)).drivingTime).toBe(minutes(5));
  });

  it('mostra quanto falta de parada para contar como pausa', () => {
    const driven = hold(newCarTrip(), 0, minutes(10), 80);
    const stopped = hold(driven, minutes(10) + SAMPLE_STEP, minutes(15), 0);
    const status = describeTripStatus(stopped, MORNING + minutes(15));
    expect(status.movement).toBe('stopped');
    expect(status.drivingTime).toBe(minutes(10) + SAMPLE_STEP);
    expect(status.stoppedFor).toBe(minutes(5) - SAMPLE_STEP);
    expect(status.breakRemaining).toBe(minutes(10) + SAMPLE_STEP);
  });

  it('mostra a pausa registrada e o tempo de direção zerado', () => {
    const driven = hold(newCarTrip(), 0, minutes(10), 80);
    const rested = hold(driven, minutes(10) + SAMPLE_STEP, minutes(26), 0);
    const status = describeTripStatus(rested, MORNING + minutes(26));
    expect(status.breakRemaining).toBe(0);
    expect(status.drivingTime).toBe(0);
  });
});

describe('RF04 - situação do pré-aviso e do lembrete de pausa', () => {
  it('fica normal antes do pré-aviso, com o tempo até o lembrete', () => {
    const trip = hold(newCarTrip(), 0, minutes(30), 80);
    const status = describeTripStatus(trip, MORNING + minutes(30));
    expect(status.breakPhase).toBe('normal');
    expect(status.timeUntilBreakReminder).toBe(hours(1.5));
  });

  it('entra no pré-aviso 15 minutos antes do lembrete do automóvel', () => {
    const trip = hold(newCarTrip(), 0, hours(1.75), 80);
    const status = describeTripStatus(trip, MORNING + hours(1.75));
    expect(status.breakPhase).toBe('preWarning');
    expect(status.timeUntilBreakReminder).toBe(minutes(15));
  });

  it('fica com a pausa vencida ao chegar ao lembrete', () => {
    const trip = hold(newCarTrip(), 0, hours(2), 80);
    const status = describeTripStatus(trip, MORNING + hours(2));
    expect(status.breakPhase).toBe('overdue');
    expect(status.timeUntilBreakReminder).toBe(0);
  });

  it('a pausa vencida reduz o intervalo de verificação para 5 minutos', () => {
    const trip = hold(newCarTrip(), 0, hours(2), 80);
    expect(describeTripStatus(trip, MORNING + hours(2)).checkInterval).toEqual({
      interval: minutes(5),
      reasons: ['breakOverdue'],
    });
  });
});

describe('RF05 - situação das verificações na tela de viagem', () => {
  it('espera o veículo andar para contar a próxima verificação', () => {
    const status = describeTripStatus(newCarTrip(), MORNING);
    expect(status.checkPhase).toBe('waitingForMovement');
    expect(status.timeUntilNextCheck).toBeNull();
    expect(status.checkInterval).toEqual({ interval: minutes(15), reasons: [] });
  });

  it('mostra quanto falta para a próxima verificação em movimento', () => {
    const trip = hold(newCarTrip(), 0, minutes(5), 80);
    const status = describeTripStatus(trip, MORNING + minutes(5));
    expect(status.checkPhase).toBe('counting');
    expect(status.timeUntilNextCheck).toBe(minutes(10));
  });

  it('não mostra tempo negativo quando a verificação já está para disparar', () => {
    const trip = hold(newCarTrip(), 0, minutes(5), 80);
    expect(describeTripStatus(trip, MORNING + minutes(20)).timeUntilNextCheck).toBe(0);
  });

  it('indica a verificação em andamento', () => {
    const trip = hold(newCarTrip(), 0, minutes(15), 80);
    const status = describeTripStatus(trip, MORNING + minutes(15));
    expect(status.checkPhase).toBe('active');
    expect(status.timeUntilNextCheck).toBeNull();
  });

  it('usa o intervalo de 5 minutos de madrugada', () => {
    expect(describeTripStatus(newCarTrip(NIGHT), NIGHT).checkInterval).toEqual({
      interval: minutes(5),
      reasons: ['night'],
    });
  });
});

describe('RF13 - recomendação de parada na tela de viagem', () => {
  it('não recomenda parada sem episódios recorrentes', () => {
    expect(describeTripStatus(newCarTrip(), MORNING).stopRecommended).toBe(false);
  });

  it('recomenda parada e reduz o intervalo depois de episódios recorrentes', () => {
    const trip: TripState = {
      ...newCarTrip(),
      recurrence: { consecutiveSevereEvents: 2, reducedIntervalActive: true },
    };
    const status = describeTripStatus(trip, MORNING);
    expect(status.stopRecommended).toBe(true);
    expect(status.checkInterval.reasons).toEqual(['recurrentEpisodes']);
  });
});

describe('RNF08 - encerrar a viagem só com o veículo parado', () => {
  it('libera com o veículo parado', () => {
    expect(isTripEndAllowed({ movement: 'stopped', simulationMode: false })).toBe(true);
  });

  it('bloqueia com o veículo em movimento', () => {
    expect(isTripEndAllowed({ movement: 'moving', simulationMode: false })).toBe(false);
  });

  it('libera no modo simulação', () => {
    expect(isTripEndAllowed({ movement: 'moving', simulationMode: true })).toBe(true);
  });
});
