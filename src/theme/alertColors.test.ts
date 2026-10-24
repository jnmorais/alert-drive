import { describe, expect, it } from '@jest/globals';

import { STAGE_ORDER } from '../core/escalation';
import { alertColorPair, type BlinkFrame } from './alertColors';
import { darkTheme, lightTheme, palette } from './colors';
import { contrastRatio } from './contrast';

const FRAMES: readonly BlinkFrame[] = [0, 1];
const THEMES = [lightTheme, darkTheme];

describe('RNF03 - cores de cada etapa na tela de alerta', () => {
  it('todas as etapas têm contraste de pelo menos 4,5:1 nos dois temas e nas duas fases do piscar', () => {
    for (const theme of THEMES) {
      for (const stage of STAGE_ORDER) {
        for (const frame of FRAMES) {
          const pair = alertColorPair(theme.alert, stage, frame);
          expect(contrastRatio(pair.text, pair.background)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('a verificação e a etapa 1 não piscam', () => {
    for (const theme of THEMES) {
      expect(alertColorPair(theme.alert, 'check', 0)).toEqual(alertColorPair(theme.alert, 'check', 1));
      expect(alertColorPair(theme.alert, 'preventive', 0)).toEqual(alertColorPair(theme.alert, 'preventive', 1));
    }
  });

  it('a etapa 2 e a etapa 3 trocam de fundo a cada fase', () => {
    for (const theme of THEMES) {
      expect(alertColorPair(theme.alert, 'mandatory', 0).background).not.toBe(
        alertColorPair(theme.alert, 'mandatory', 1).background,
      );
      expect(alertColorPair(theme.alert, 'maximum', 0).background).not.toBe(
        alertColorPair(theme.alert, 'maximum', 1).background,
      );
    }
  });

  it('a etapa 3 alterna preto e laranja nos dois temas', () => {
    for (const theme of THEMES) {
      const backgrounds = FRAMES.map((frame) => alertColorPair(theme.alert, 'maximum', frame).background);
      expect(backgrounds).toEqual([palette.black, palette.alertOrange]);
    }
  });
});
