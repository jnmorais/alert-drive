import { describe, expect, it } from '@jest/globals';

import {
  BLINK_PHASE_DURATION,
  blinkFlashesPerSecond,
  describeActiveAlert,
  MAX_FLASHES_PER_SECOND,
} from './alertView';
import { minutes, seconds } from './duration';
import { getDefaultSettings } from './profiles';
import type { ResponseContext } from './responsePolicy';
import { advanceTripTime, processTripSpeedSample, respondToCheck, startTrip, type TripState } from './trip';

const START = Date.UTC(2026, 9, 24, 13, 0);
const CHECK_AT = START + minutes(10);
const MOVING: ResponseContext = { movement: 'moving', simulationMode: false };
const STOPPED: ResponseContext = { movement: 'stopped', simulationMode: false };
const SIMULATION: ResponseContext = { movement: 'moving', simulationMode: true };

function tripWithCheck(): TripState {
  let trip = startTrip({
    vehicleType: 'bus',
    settings: getDefaultSettings('bus'),
    utcOffsetMinutes: -180,
    startedAt: START,
  });
  for (let at = START; at <= START + minutes(5); at += seconds(30)) {
    trip = processTripSpeedSample(trip, { at, speedKmh: 80 }).trip;
  }
  return trip;
}

function at(offset: number): TripState {
  return advanceTripTime(tripWithCheck(), CHECK_AT + offset).trip;
}

describe('RF08 - etapa mostrada na tela de alerta', () => {
  it('não mostra alerta sem verificação em andamento', () => {
    const trip = startTrip({
      vehicleType: 'bus',
      settings: getDefaultSettings('bus'),
      utcOffsetMinutes: -180,
      startedAt: START,
    });
    expect(describeActiveAlert(trip, STOPPED, ['touch'])).toBeNull();
  });

  it('mostra a verificação no início', () => {
    const view = describeActiveAlert(at(0), MOVING, ['touch']);
    expect(view?.stage).toBe('check');
    expect(view?.visual).toBe('message');
  });

  it('segue as etapas do ônibus: 15 s, 25 s e 35 s após a verificação', () => {
    expect(describeActiveAlert(at(seconds(15)), MOVING, ['touch'])?.visual).toBe('fixedBanner');
    expect(describeActiveAlert(at(seconds(25)), MOVING, ['touch'])?.visual).toBe('blinking');
    expect(describeActiveAlert(at(seconds(35)), MOVING, ['touch'])?.visual).toBe('fullScreen');
  });

  it('some depois da resposta', () => {
    const answered = respondToCheck(at(seconds(3)), CHECK_AT + seconds(3)).trip;
    expect(describeActiveAlert(answered, STOPPED, ['touch'])).toBeNull();
  });
});

describe('RF06 - formas de resposta oferecidas na tela de alerta', () => {
  it('não oferece toque com o veículo em movimento', () => {
    expect(describeActiveAlert(at(0), MOVING, ['touch'])?.touchAllowed).toBe(false);
  });

  it('oferece toque com o veículo parado', () => {
    expect(describeActiveAlert(at(0), STOPPED, ['touch'])?.touchAllowed).toBe(true);
  });

  it('oferece toque no modo simulação', () => {
    expect(describeActiveAlert(at(0), SIMULATION, ['touch'])?.touchAllowed).toBe(true);
  });

  it('não oferece toque se o aparelho não tem essa forma de resposta', () => {
    expect(describeActiveAlert(at(0), STOPPED, ['voice'])?.touchAllowed).toBe(false);
  });

  it('indica se há resposta sem toque disponível', () => {
    expect(describeActiveAlert(at(0), MOVING, ['touch'])?.handsFreeAvailable).toBe(false);
    expect(describeActiveAlert(at(0), MOVING, ['touch', 'voice'])?.handsFreeAvailable).toBe(true);
  });
});

describe('RNF03 - ritmo do piscar da etapa 2', () => {
  it('pisca no máximo 3 vezes por segundo, limite contra crises fotossensíveis', () => {
    expect(MAX_FLASHES_PER_SECOND).toBe(3);
    expect(blinkFlashesPerSecond(BLINK_PHASE_DURATION)).toBeLessThanOrEqual(MAX_FLASHES_PER_SECOND);
  });

  it('usa uma troca de cor a cada meio segundo, um ciclo por segundo', () => {
    expect(BLINK_PHASE_DURATION).toBe(seconds(0.5));
    expect(blinkFlashesPerSecond(BLINK_PHASE_DURATION)).toBe(1);
  });
});
