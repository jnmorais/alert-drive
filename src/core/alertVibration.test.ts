import { describe, expect, it } from '@jest/globals';

import { desiredAlertVibration, VIBRATION_TIMINGS } from './alertVibration';
import { minutes, seconds } from './duration';
import { getDefaultSettings } from './profiles';
import {
  advanceTripTime,
  changeTripChannel,
  processTripSpeedSample,
  respondToCheck,
  startTrip,
  toggleTripSilence,
  type TripChannelResult,
  type TripState,
} from './trip';

const START = Date.UTC(2026, 9, 24, 13, 0);
const CHECK_AT = START + minutes(10);

function idleTrip(): TripState {
  return startTrip({ vehicleType: 'bus', settings: getDefaultSettings('bus'), utcOffsetMinutes: -180, startedAt: START });
}

function at(offset: number): TripState {
  let trip = idleTrip();
  for (let sampleAt = START; sampleAt <= START + minutes(5); sampleAt += seconds(30)) {
    trip = processTripSpeedSample(trip, { at: sampleAt, speedKmh: 80 }).trip;
  }
  return advanceTripTime(trip, CHECK_AT + offset).trip;
}

function changed(result: TripChannelResult): TripState {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.trip;
}

describe('RF08 - vibração de cada etapa (Quadro 1)', () => {
  it('não vibra na verificação, antes do escalonamento', () => {
    expect(desiredAlertVibration(at(0))).toBeNull();
  });

  it('pulsos curtos na etapa 1 e vibração contínua nas etapas 2 e 3', () => {
    expect(desiredAlertVibration(at(seconds(15)))).toEqual({ pattern: 'shortPulses', key: `${CHECK_AT}:shortPulses` });
    expect(desiredAlertVibration(at(seconds(25)))).toEqual({ pattern: 'continuous', key: `${CHECK_AT}:continuous` });
    expect(desiredAlertVibration(at(seconds(35)))).toEqual({ pattern: 'continuous', key: `${CHECK_AT}:continuous` });
  });

  it('a vibração contínua não recomeça da etapa 2 para a 3', () => {
    expect(desiredAlertVibration(at(seconds(25)))?.key).toBe(desiredAlertVibration(at(seconds(35)))?.key);
  });

  it('para quando o motorista responde, e não vibra sem viagem ou sem verificação', () => {
    expect(desiredAlertVibration(respondToCheck(at(seconds(30)), CHECK_AT + seconds(30)).trip)).toBeNull();
    expect(desiredAlertVibration(null)).toBeNull();
    expect(desiredAlertVibration(idleTrip())).toBeNull();
  });

  it('pulso de 0,2 s a cada segundo e vibração contínua em blocos de 1 s repetidos', () => {
    expect(VIBRATION_TIMINGS.shortPulses).toEqual([0, 200, 800]);
    expect(VIBRATION_TIMINGS.continuous).toEqual([0, 1000]);
  });
});

describe('RF09 e RF10 - vibração segue os canais de alerta', () => {
  it('não vibra com o canal vibratório desligado', () => {
    expect(desiredAlertVibration(changed(changeTripChannel(at(seconds(15)), 'vibration', false)))).toBeNull();
  });

  it('silenciar desliga só o som: a vibração continua', () => {
    expect(desiredAlertVibration(changed(toggleTripSilence(at(seconds(25)))))?.pattern).toBe('continuous');
  });
});
