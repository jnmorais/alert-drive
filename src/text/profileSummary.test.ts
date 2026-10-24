import { describe, expect, it } from '@jest/globals';

import { getDefaultSettings } from '../core/profiles';
import { describeProfileSettings } from './profileSummary';

describe('RF01 - resumo do perfil escolhido em português', () => {
  it('resume os valores do caminhão', () => {
    expect(describeProfileSettings(getDefaultSettings('truck'))).toEqual([
      { label: 'Lembrete de pausa', value: 'após 5 h 30 min de direção' },
      { label: 'Pausa mínima', value: '30 min' },
      { label: 'Verificação', value: 'a cada 10 min (5 min de madrugada)' },
      { label: 'Etapas do alerta', value: 'a cada 15 s' },
    ]);
  });

  it('resume os valores do ônibus com etapas de 10 segundos', () => {
    expect(describeProfileSettings(getDefaultSettings('bus'))[3]).toEqual({
      label: 'Etapas do alerta',
      value: 'a cada 10 s',
    });
  });

  it('resume os valores do automóvel', () => {
    const lines = describeProfileSettings(getDefaultSettings('car'));
    expect(lines[0]?.value).toBe('após 2 h de direção');
    expect(lines[2]?.value).toBe('a cada 15 min (5 min de madrugada)');
  });
});
