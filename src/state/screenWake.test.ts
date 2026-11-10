import { describe, expect, it } from '@jest/globals';

import { getDefaultSettings } from '../core/profiles';
import type { Clock } from '../core/types';
import { connectScreenWake, type ScreenWake } from './screenWake';
import { createTripController, type TimerScheduler } from './tripController';

const clock: Clock = { now: () => Date.UTC(2026, 10, 10, 12, 0) };
const timers: TimerScheduler = { schedule: () => () => undefined };

function recordingScreen(): ScreenWake & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    keepAwake: () => calls.push('manter ligada'),
    allowSleep: () => calls.push('liberar'),
  };
}

function start(controller: ReturnType<typeof createTripController>, simulationMode: boolean): void {
  controller.start({
    vehicleType: 'bus',
    settings: getDefaultSettings('bus'),
    utcOffsetMinutes: -180,
    clock,
    simulationMode,
  });
}

describe('RNF06 - tela ligada só durante a viagem', () => {
  it('liga ao começar a viagem real e libera ao encerrar', () => {
    const controller = createTripController({ timers });
    const screen = recordingScreen();
    connectScreenWake(controller, screen);
    expect(screen.calls).toEqual([]);
    start(controller, false);
    controller.pushSpeedSample(80);
    controller.end();
    expect(screen.calls).toEqual(['manter ligada', 'liberar']);
  });

  it('também mantém a tela ligada na simulação', () => {
    const controller = createTripController({ timers });
    const screen = recordingScreen();
    connectScreenWake(controller, screen);
    start(controller, true);
    expect(screen.calls).toEqual(['manter ligada']);
  });

  it('desconectar durante a viagem libera a tela, e sem viagem não faz nada', () => {
    const during = createTripController({ timers });
    const duringScreen = recordingScreen();
    const disconnect = connectScreenWake(during, duringScreen);
    start(during, false);
    disconnect();
    during.end();
    expect(duringScreen.calls).toEqual(['manter ligada', 'liberar']);

    const idle = createTripController({ timers });
    const idleScreen = recordingScreen();
    connectScreenWake(idle, idleScreen)();
    expect(idleScreen.calls).toEqual([]);
  });
});
