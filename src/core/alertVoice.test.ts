import { describe, expect, it } from '@jest/globals';

import { desiredAlertVoice } from './alertVoice';
import { minutes, seconds } from './duration';
import { ALERT_MESSAGE } from './escalation';
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

describe('RF08 e RF11 - mensagem de voz da etapa 2', () => {
  it('não fala na verificação nem na etapa 1', () => {
    expect(desiredAlertVoice(at(0))).toBeNull();
    expect(desiredAlertVoice(at(seconds(15)))).toBeNull();
  });

  it('fala a mesma frase da tela ao entrar na etapa 2', () => {
    expect(desiredAlertVoice(at(seconds(25)))).toEqual({ text: ALERT_MESSAGE, key: `${CHECK_AT}` });
    expect(ALERT_MESSAGE).toBe('Atenção. Sinais de sonolência. Procure um local seguro para parar.');
  });

  it('a chegada da etapa 3 não interrompe nem repete a fala da mesma verificação', () => {
    expect(desiredAlertVoice(at(seconds(35)))).toEqual(desiredAlertVoice(at(seconds(25))));
  });

  it('fala mesmo se a etapa 2 for ultrapassada de uma vez até a etapa 3', () => {
    const jumped = advanceTripTime(at(seconds(15)), CHECK_AT + seconds(40)).trip;
    expect(jumped.escalation?.stage).toBe('maximum');
    expect(desiredAlertVoice(jumped)?.text).toBe(ALERT_MESSAGE);
  });

  it('não fala sem viagem, sem verificação ou depois da resposta', () => {
    expect(desiredAlertVoice(null)).toBeNull();
    expect(desiredAlertVoice(idleTrip())).toBeNull();
    expect(desiredAlertVoice(respondToCheck(at(seconds(30)), CHECK_AT + seconds(30)).trip)).toBeNull();
  });
});

describe('RF09 e RF10 - voz segue o canal sonoro', () => {
  it('não fala com o canal sonoro desligado nem com os alertas silenciados', () => {
    expect(desiredAlertVoice(changed(changeTripChannel(at(seconds(25)), 'sound', false)))).toBeNull();
    expect(desiredAlertVoice(changed(toggleTripSilence(at(seconds(25)))))).toBeNull();
  });
});
