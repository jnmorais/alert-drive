import { describe, expect, it } from '@jest/globals';

import { getDefaultSettings } from '../core/profiles';
import type { Clock } from '../core/types';
import { createTripController, type TimerScheduler } from './tripController';
import { connectVoicePreparation } from './voicePreparation';

const timers: TimerScheduler = { schedule: () => () => undefined };

function startTrip(controller: ReturnType<typeof createTripController>, at: number): void {
  const clock: Clock = { now: () => at };
  controller.start({ vehicleType: 'car', settings: getDefaultSettings('car'), utcOffsetMinutes: -180, clock, simulationMode: true });
}

describe('RF06 - permissão do microfone pedida no início da viagem, não durante o alerta', () => {
  it('prepara a voz uma vez a cada viagem que começa', () => {
    const controller = createTripController({ timers });
    let prepared = 0;
    connectVoicePreparation(controller, {
      prepare: async () => {
        prepared += 1;
      },
    });
    expect(prepared).toBe(0);
    startTrip(controller, Date.UTC(2026, 10, 10, 12, 0));
    controller.pushSpeedSample(80);
    controller.pushSpeedSample(80);
    expect(prepared).toBe(1);
    controller.end();
    startTrip(controller, Date.UTC(2026, 10, 10, 13, 0));
    expect(prepared).toBe(2);
  });

  it('desconectar deixa de acompanhar as viagens', () => {
    const controller = createTripController({ timers });
    let prepared = 0;
    const disconnect = connectVoicePreparation(controller, {
      prepare: async () => {
        prepared += 1;
      },
    });
    disconnect();
    startTrip(controller, Date.UTC(2026, 10, 10, 12, 0));
    expect(prepared).toBe(0);
  });
});
