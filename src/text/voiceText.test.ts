import { describe, expect, it } from '@jest/globals';

import { voiceMessage } from './voiceText';

describe('RF06 e RNF08 - situação da resposta por voz na tela de viagem', () => {
  it('não mostra nada antes da primeira viagem', () => {
    expect(voiceMessage('unknown')).toBeNull();
  });

  it('diz o que falar quando a voz está pronta', () => {
    expect(voiceMessage('ready')).toEqual({
      text: 'Resposta por voz pronta: no alerta, diga “estou bem” ou “ok”.',
      emphasis: false,
    });
    expect(voiceMessage('preparing')).toEqual({ text: 'Preparando a resposta por voz…', emphasis: false });
  });

  it('destaca quando só resta o toque com o veículo parado', () => {
    expect(voiceMessage('denied')).toEqual({
      text: 'Sem permissão do microfone. No alerta, responda pelo toque com o veículo parado.',
      emphasis: true,
    });
    expect(voiceMessage('unsupported')?.emphasis).toBe(true);
    expect(voiceMessage('unsupported')?.text).toContain('não reconhece voz sem internet');
  });
});
