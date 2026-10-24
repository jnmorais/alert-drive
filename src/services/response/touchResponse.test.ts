import { describe, expect, it } from '@jest/globals';

import type { ResponseContext } from '../../core/responsePolicy';
import type { Clock } from '../../core/types';
import type { DriverResponse } from './ResponseProvider';
import { createTouchResponseProvider } from './touchResponse';

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const fixedClock: Clock = { now: () => NOW };

const moving: ResponseContext = { movement: 'moving', simulationMode: false };
const stopped: ResponseContext = { movement: 'stopped', simulationMode: false };
const simulatedMoving: ResponseContext = { movement: 'moving', simulationMode: true };

function listeningProvider() {
  const provider = createTouchResponseProvider(fixedClock);
  const received: DriverResponse[] = [];
  provider.start((response) => received.push(response));
  return { provider, received };
}

describe('RF06 - resposta por toque', () => {
  it('é identificada como toque', () => {
    expect(createTouchResponseProvider(fixedClock).method).toBe('touch');
  });

  it('fica disponível só com o veículo parado ou na simulação', () => {
    const provider = createTouchResponseProvider(fixedClock);
    expect(provider.isAvailable(moving)).toBe(false);
    expect(provider.isAvailable(stopped)).toBe(true);
    expect(provider.isAvailable(simulatedMoving)).toBe(true);
  });

  it('com o veículo parado, o toque entrega a resposta com o horário do relógio', () => {
    const { provider, received } = listeningProvider();
    expect(provider.press(stopped)).toEqual({ accepted: true });
    expect(received).toEqual([{ method: 'touch', at: NOW }]);
  });

  it('no modo simulação, o toque é aceito com o veículo simulado em movimento', () => {
    const { provider, received } = listeningProvider();
    expect(provider.press(simulatedMoving)).toEqual({ accepted: true });
    expect(received).toHaveLength(1);
  });

  it('com o veículo em movimento, recusa o toque mesmo que a tela mostre o botão por engano', () => {
    const { provider, received } = listeningProvider();
    expect(provider.press(moving)).toEqual({ accepted: false, reason: 'vehicleMoving' });
    expect(received).toEqual([]);
  });

  it('fora de uma verificação, o toque é ignorado', () => {
    const provider = createTouchResponseProvider(fixedClock);
    expect(provider.isListening()).toBe(false);
    expect(provider.press(stopped)).toEqual({ accepted: false, reason: 'notListening' });
  });

  it('para de escutar quando a verificação termina', () => {
    const { provider, received } = listeningProvider();
    expect(provider.isListening()).toBe(true);
    provider.stop();
    expect(provider.isListening()).toBe(false);
    expect(provider.press(stopped)).toEqual({ accepted: false, reason: 'notListening' });
    expect(received).toEqual([]);
  });
});
