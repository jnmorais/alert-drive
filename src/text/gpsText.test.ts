import { describe, expect, it } from '@jest/globals';

import { gpsMessage } from './gpsText';

describe('RF03 e RNF08 - situação do GPS na tela de viagem', () => {
  it('não mostra nada fora de uma viagem real', () => {
    expect(gpsMessage({ state: 'inactive' })).toBeNull();
  });

  it('mostra a velocidade arredondada e o andamento do GPS em linha simples', () => {
    expect(gpsMessage({ state: 'tracking', speedKmh: 79.6 })).toEqual({ text: 'GPS: 80 km/h', emphasis: false });
    expect(gpsMessage({ state: 'waiting' })).toEqual({ text: 'GPS: aguardando sinal…', emphasis: false });
    expect(gpsMessage({ state: 'requesting' })).toEqual({
      text: 'GPS: pedindo permissão de localização…',
      emphasis: false,
    });
  });

  it('destaca quando o tempo de direção não está sendo contado', () => {
    expect(gpsMessage({ state: 'denied' })).toEqual({
      text: 'Sem permissão de localização. O tempo de direção não está sendo contado.',
      emphasis: true,
    });
    expect(gpsMessage({ state: 'servicesOff' })?.emphasis).toBe(true);
    expect(gpsMessage({ state: 'error' })?.text).toContain('O tempo de direção não está sendo contado');
  });
});
