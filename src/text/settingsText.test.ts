import { describe, expect, it } from '@jest/globals';

import { createTripAlertChannels } from '../core/alertChannels';
import {
  breakReminderNote,
  channelRestrictionExplanation,
  channelValueLabel,
  CHECK_INTERVAL_NOTE,
  silenceButtonLabel,
  VISUAL_ONLY_EXPLANATION,
} from './settingsText';

describe('RF02 - textos das configurações do perfil', () => {
  it('informa a faixa do intervalo de verificação', () => {
    expect(CHECK_INTERVAL_NOTE).toBe('Entre 5 min e 15 min. De madrugada ou com a pausa vencida, passa a 5 min.');
  });

  it('informa o teto legal no caminhão e no ônibus', () => {
    expect(breakReminderNote('truck')).toBe('Só pode ser reduzido. Máximo: 5 h 30 min, o limite legal.');
    expect(breakReminderNote('bus')).toBe('Só pode ser reduzido. Máximo: 4 h, o limite legal.');
  });

  it('informa o padrão do perfil no automóvel', () => {
    expect(breakReminderNote('car')).toBe('Só pode ser reduzido. Máximo: 2 h, o padrão do perfil.');
  });
});

describe('RF09 - situação e explicação dos canais de alerta', () => {
  it('mostra som e vibração ligados no início da viagem', () => {
    const state = createTripAlertChannels();
    expect(channelValueLabel(state, 'sound')).toBe('Ligado');
    expect(channelValueLabel(state, 'vibration')).toBe('Ligada');
  });

  it('mostra canais desligados', () => {
    const state = { soundEnabled: false, vibrationEnabled: true, silenced: false };
    expect(channelValueLabel(state, 'sound')).toBe('Desligado');
    expect(channelValueLabel({ ...state, soundEnabled: true, vibrationEnabled: false }, 'vibration')).toBe('Desligada');
  });

  it('explica por que não é possível ficar só com a tela quando resta um único canal', () => {
    expect(channelRestrictionExplanation({ soundEnabled: true, vibrationEnabled: false, silenced: false })).toBe(
      VISUAL_ONLY_EXPLANATION,
    );
    expect(channelRestrictionExplanation({ soundEnabled: true, vibrationEnabled: true, silenced: true })).toBe(
      VISUAL_ONLY_EXPLANATION,
    );
  });

  it('não mostra explicação com som e vibração ligados', () => {
    expect(channelRestrictionExplanation(createTripAlertChannels())).toBeNull();
  });
});

describe('RF10 - textos do silenciar', () => {
  it('mostra o som silenciado', () => {
    expect(channelValueLabel({ soundEnabled: true, vibrationEnabled: true, silenced: true }, 'sound')).toBe(
      'Silenciado',
    );
  });

  it('usa o mesmo botão para silenciar e reativar', () => {
    expect(silenceButtonLabel(createTripAlertChannels())).toBe('Silenciar alertas');
    expect(silenceButtonLabel({ soundEnabled: true, vibrationEnabled: true, silenced: true })).toBe('Reativar o som');
  });
});
