import { describe, expect, it } from '@jest/globals';

import type { ActiveAlertView } from '../core/alertView';
import { STAGE_BEHAVIOR, STAGE_ORDER } from '../core/escalation';
import { ALERT_SCREEN_MESSAGES, responseInstruction, TOUCH_RESPONSE_LABEL } from './alertText';

const view: ActiveAlertView = {
  stage: 'check',
  visual: 'message',
  touchAllowed: false,
  handsFreeAvailable: false,
};

describe('RF11 - mesma frase na tela e na voz', () => {
  it('a tela mostra exatamente a frase falada em toda etapa com mensagem de voz', () => {
    for (const stage of STAGE_ORDER) {
      const voice = STAGE_BEHAVIOR[stage].voiceMessage;
      if (voice !== null) {
        expect(ALERT_SCREEN_MESSAGES[stage]).toBe(voice);
      }
    }
  });

  it('a tela usa a mensagem definida pelo núcleo em toda etapa que tem uma', () => {
    for (const stage of STAGE_ORDER) {
      const screen = STAGE_BEHAVIOR[stage].screenMessage;
      if (screen !== null) {
        expect(ALERT_SCREEN_MESSAGES[stage]).toBe(screen);
      }
    }
  });

  it('as etapas 2 e 3 mostram a frase do Quadro 1', () => {
    expect(ALERT_SCREEN_MESSAGES.mandatory).toBe('Atenção. Sinais de sonolência. Procure um local seguro para parar.');
    expect(ALERT_SCREEN_MESSAGES.maximum).toBe(ALERT_SCREEN_MESSAGES.mandatory);
  });
});

describe('RNF08 - textos curtos da tela de alerta', () => {
  it('todas as mensagens têm no máximo 70 caracteres', () => {
    for (const stage of STAGE_ORDER) {
      expect(ALERT_SCREEN_MESSAGES[stage].length).toBeLessThanOrEqual(70);
    }
  });

  it('o botão de resposta tem uma palavra curta', () => {
    expect(TOUCH_RESPONSE_LABEL).toBe('Estou bem');
  });
});

describe('RF06 - instrução de resposta na tela de alerta', () => {
  it('pede o toque quando ele é permitido', () => {
    expect(responseInstruction({ ...view, touchAllowed: true })).toBe('Toque no botão para responder.');
  });

  it('pede a voz quando só há resposta sem toque', () => {
    expect(responseInstruction({ ...view, handsFreeAvailable: true })).toBe('Diga “estou bem” ou “ok”.');
  });

  it('oferece as duas formas quando ambas estão disponíveis', () => {
    expect(responseInstruction({ ...view, touchAllowed: true, handsFreeAvailable: true })).toBe(
      'Diga “estou bem” ou toque no botão.',
    );
  });

  it('orienta a parar quando não há forma de resposta em movimento', () => {
    expect(responseInstruction(view)).toBe('Pare em local seguro para responder pelo toque.');
  });
});
