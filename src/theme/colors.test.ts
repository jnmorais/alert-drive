import { describe, expect, it } from '@jest/globals';

import {
  type ColorPair,
  darkTheme,
  getThemeColors,
  lightTheme,
  palette,
  type ThemeColors,
} from './colors';
import { contrastRatio, hueFamily, parseHexColor, relativeLuminance } from './contrast';

const MINIMUM_TEXT_CONTRAST = 4.5;
const MINIMUM_NON_TEXT_CONTRAST = 3;

function isColorPair(value: unknown): value is ColorPair {
  return typeof value === 'object' && value !== null && 'background' in value && 'text' in value;
}

function collectPairs(value: unknown, path: string): [string, ColorPair][] {
  if (isColorPair(value)) {
    return [[path, value]];
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => collectPairs(child, `${path}.${key}`));
  }
  return [];
}

function allTextPairs(theme: ThemeColors): [string, ColorPair][] {
  return [['fundo da tela', { background: theme.background, text: theme.text }], ...collectPairs(theme, 'tema')];
}

const themes = [
  ['claro', lightTheme],
  ['escuro', darkTheme],
] as const;

describe('RNF03 - paleta extraída do logo', () => {
  it('tem exatamente as quatro cores do logo', () => {
    expect(palette).toEqual({
      black: '#000000',
      graphite: '#282C2E',
      white: '#FAFAF8',
      alertOrange: '#F07E14',
    });
  });

  it('usa apenas cores neutras ou laranja, sem vermelho, verde, amarelo, azul ou violeta', () => {
    expect(Object.values(palette).map(hueFamily).sort()).toEqual(['neutral', 'neutral', 'neutral', 'orange']);
  });
});

describe.each(themes)('RNF03 - legibilidade no tema %s', (_label, theme) => {
  it.each(allTextPairs(theme))('%s tem contraste de texto de pelo menos 4,5:1', (_path, pair) => {
    expect(contrastRatio(pair.text, pair.background)).toBeGreaterThanOrEqual(MINIMUM_TEXT_CONTRAST);
  });

  it.each(allTextPairs(theme))('%s não usa branco sobre laranja nem laranja sobre branco', (_path, pair) => {
    const colors = [pair.text, pair.background];
    expect(colors.includes(palette.white) && colors.includes(palette.alertOrange)).toBe(false);
  });

  it('a borda se destaca do fundo com contraste de pelo menos 3:1', () => {
    expect(contrastRatio(theme.border, theme.background)).toBeGreaterThanOrEqual(MINIMUM_NON_TEXT_CONTRAST);
  });

  it('a etapa 3 em tela cheia alterna preto e laranja, com texto preto sobre o laranja', () => {
    const [blackPhase, orangePhase] = theme.alert.maximumFullScreen;
    expect(blackPhase.background).toBe(palette.black);
    expect([palette.white, palette.alertOrange]).toContain(blackPhase.text);
    expect(orangePhase).toEqual({ background: palette.alertOrange, text: palette.black });
  });

  it('as duas fases da etapa 2 piscante têm fundos diferentes', () => {
    const [first, second] = theme.alert.mandatoryBlink;
    expect(first.background).not.toBe(second.background);
  });

  it('a faixa da etapa 1 usa o laranja de alerta com texto preto', () => {
    expect(theme.alert.preventiveBanner).toEqual({ background: palette.alertOrange, text: palette.black });
  });
});

describe('Escolha do tema pelo sistema', () => {
  it('usa o tema escuro quando o sistema está escuro', () => {
    expect(getThemeColors('dark')).toBe(darkTheme);
  });

  it.each(['light', null, undefined] as const)('usa o tema claro para %s', (scheme) => {
    expect(getThemeColors(scheme)).toBe(lightTheme);
  });

  it('fundo claro é branco e fundo escuro é preto', () => {
    expect(lightTheme.background).toBe(palette.white);
    expect(darkTheme.background).toBe(palette.black);
  });
});

describe('Cálculo de contraste e família de cor', () => {
  it('lê cores hexadecimais', () => {
    expect(parseHexColor('#F07E14')).toEqual({ red: 240, green: 126, blue: 20 });
    expect(() => parseHexColor('laranja')).toThrow('Cor inválida: laranja');
  });

  it('calcula a luminância relativa dos extremos', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('preto e branco puros têm contraste de 21:1, em qualquer ordem', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });

  it('confirma que branco sobre o laranja do logo fica abaixo de 3:1', () => {
    expect(contrastRatio(palette.white, palette.alertOrange)).toBeLessThan(3);
  });

  it.each([
    ['#000000', 'neutral'],
    ['#E02020', 'red'],
    ['#F07E14', 'orange'],
    ['#E8D020', 'yellow'],
    ['#20C040', 'green'],
    ['#2050E0', 'blue'],
    ['#9030D0', 'violet'],
    ['#E0207A', 'red'],
  ])('classifica %s como %s', (hex, family) => {
    expect(hueFamily(hex)).toBe(family);
  });
});
