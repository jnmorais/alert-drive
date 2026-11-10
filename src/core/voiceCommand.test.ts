import { describe, expect, it } from '@jest/globals';

import { ALERT_MESSAGE } from './escalation';
import { isAffirmativeVoiceResponse, normalizeSpokenWords, VOICE_RESPONSE_HINTS } from './voiceCommand';

describe('RF06 - respostas faladas aceitas', () => {
  it('aceita "estou bem" e "ok", como pede o requisito', () => {
    expect(isAffirmativeVoiceResponse(['estou bem'])).toBe(true);
    expect(isAffirmativeVoiceResponse(['ok'])).toBe(true);
    expect(VOICE_RESPONSE_HINTS).toEqual(['estou bem', 'ok']);
  });

  it('tolera acento, maiúsculas, pontuação e as formas faladas mais comuns', () => {
    expect(isAffirmativeVoiceResponse(['Estou bem!'])).toBe(true);
    expect(isAffirmativeVoiceResponse(['tô bem'])).toBe(true);
    expect(isAffirmativeVoiceResponse(['OK.'])).toBe(true);
    expect(isAffirmativeVoiceResponse(['okay'])).toBe(true);
    expect(isAffirmativeVoiceResponse(['sim, estou bem sim'])).toBe(true);
  });

  it('aceita se qualquer uma das alternativas reconhecidas for uma resposta válida', () => {
    expect(isAffirmativeVoiceResponse(['esta bem', 'estou bem'])).toBe(true);
  });
});

describe('RF06 - respostas faladas recusadas', () => {
  it('recusa a negação: quem diz que não está bem não encerra o alerta', () => {
    expect(isAffirmativeVoiceResponse(['não estou bem'])).toBe(false);
    expect(isAffirmativeVoiceResponse(['Não tô bem'])).toBe(false);
    expect(isAffirmativeVoiceResponse(['não ok'])).toBe(false);
  });

  it('recusa falas sem a resposta, vazias ou em que a palavra só aparece dentro de outra', () => {
    expect(isAffirmativeVoiceResponse([])).toBe(false);
    expect(isAffirmativeVoiceResponse([''])).toBe(false);
    expect(isAffirmativeVoiceResponse(['estou cansado'])).toBe(false);
    expect(isAffirmativeVoiceResponse(['bem estou'])).toBe(false);
    expect(isAffirmativeVoiceResponse(['facebook'])).toBe(false);
  });

  it('a mensagem de voz do próprio alerta não conta como resposta', () => {
    expect(isAffirmativeVoiceResponse([ALERT_MESSAGE])).toBe(false);
  });
});

describe('RF06 - normalização da fala reconhecida', () => {
  it('separa as palavras sem acento, em minúsculas e sem pontuação', () => {
    expect(normalizeSpokenWords('  Tô BEM, obrigado! ')).toEqual(['to', 'bem', 'obrigado']);
  });
});
