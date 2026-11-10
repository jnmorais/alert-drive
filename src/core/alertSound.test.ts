import { describe, expect, it } from '@jest/globals';

import { desiredAlertSound, noticeSound } from './alertSound';
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

function tripWithCheck(): TripState {
  let trip = idleTrip();
  for (let at = START; at <= START + minutes(5); at += seconds(30)) {
    trip = processTripSpeedSample(trip, { at, speedKmh: 80 }).trip;
  }
  return trip;
}

function at(offset: number): TripState {
  return advanceTripTime(tripWithCheck(), CHECK_AT + offset).trip;
}

function changed(result: TripChannelResult): TripState {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.trip;
}

describe('RF05 - tom curto da verificação', () => {
  it('toca o tom curto uma vez, em volume baixo, quando a verificação começa', () => {
    expect(desiredAlertSound(at(0))).toEqual({
      pattern: 'shortTone',
      volume: 0.5,
      loop: false,
      key: `${CHECK_AT}:check`,
    });
  });

  it('não toca nada sem viagem, sem verificação ou depois da resposta', () => {
    expect(desiredAlertSound(null)).toBeNull();
    expect(desiredAlertSound(idleTrip())).toBeNull();
    expect(desiredAlertSound(respondToCheck(at(seconds(3)), CHECK_AT + seconds(3)).trip)).toBeNull();
  });
});

describe('RF08 e RNF02 - alarme em volume relativo crescente por etapa', () => {
  it('etapa 1 em 50%, etapa 2 em 75% e etapa 3 em 100%, repetindo até a resposta', () => {
    const cues = [seconds(15), seconds(25), seconds(35)].map((offset) => desiredAlertSound(at(offset)));
    expect(cues).toEqual([
      { pattern: 'alarm', volume: 0.5, loop: true, key: `${CHECK_AT}:preventive` },
      { pattern: 'alarm', volume: 0.75, loop: true, key: `${CHECK_AT}:mandatory` },
      { pattern: 'alarm', volume: 1, loop: true, key: `${CHECK_AT}:maximum` },
    ]);
  });

  it('a etapa 3 continua tocando até o reconhecimento', () => {
    expect(desiredAlertSound(at(minutes(5)))?.volume).toBe(1);
  });

  it('para assim que o motorista responde, em qualquer etapa', () => {
    expect(desiredAlertSound(respondToCheck(at(seconds(30)), CHECK_AT + seconds(30)).trip)).toBeNull();
  });

  it('cada verificação tem uma identificação própria para o som recomeçar', () => {
    expect(desiredAlertSound(at(seconds(15)))?.key).not.toBe(desiredAlertSound(at(seconds(25)))?.key);
  });
});

describe('RF09 e RF10 - som segue os canais de alerta', () => {
  it('não toca com o canal sonoro desligado', () => {
    const muted = changed(changeTripChannel(at(seconds(15)), 'sound', false));
    expect(desiredAlertSound(muted)).toBeNull();
  });

  it('não toca com os alertas silenciados e volta ao reativar', () => {
    const silenced = changed(toggleTripSilence(at(seconds(25))));
    expect(desiredAlertSound(silenced)).toBeNull();
    expect(desiredAlertSound(changed(toggleTripSilence(silenced)))?.volume).toBe(0.75);
  });
});

describe('RF04 e RF13 - tom curto nos avisos de pausa e na recomendação de parada', () => {
  it('toca o tom curto no pré-aviso, no lembrete de pausa e na recomendação de parada', () => {
    const trip = idleTrip();
    expect(noticeSound([{ type: 'breakPreWarning', at: START }], trip)).toEqual({
      pattern: 'shortTone',
      volume: 0.5,
      loop: false,
      key: `breakPreWarning:${START}`,
    });
    expect(noticeSound([{ type: 'breakReminder', at: START }], trip)?.key).toBe(`breakReminder:${START}`);
    expect(noticeSound([{ type: 'stopRecommended', at: START }], trip)?.key).toBe(`stopRecommended:${START}`);
  });

  it('ignora os demais eventos', () => {
    expect(
      noticeSound(
        [
          { type: 'checkStarted', at: START, interval: minutes(10), reasons: [] },
          { type: 'breakRegistered', at: START, stoppedSince: START - minutes(30) },
        ],
        idleTrip(),
      ),
    ).toBeNull();
  });

  it('não toca o aviso por cima de um alerta em andamento, sem viagem ou com o som desligado', () => {
    const notice = [{ type: 'breakReminder' as const, at: CHECK_AT }];
    expect(noticeSound(notice, at(seconds(15)))).toBeNull();
    expect(noticeSound(notice, null)).toBeNull();
    expect(noticeSound(notice, changed(changeTripChannel(idleTrip(), 'sound', false)))).toBeNull();
  });
});
