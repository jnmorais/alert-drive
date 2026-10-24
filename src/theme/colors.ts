export const palette = {
  black: '#000000',
  graphite: '#282C2E',
  white: '#FAFAF8',
  alertOrange: '#F07E14',
} as const;

export type PaletteColor = (typeof palette)[keyof typeof palette];

export type ColorSchemeName = 'light' | 'dark';

export interface ColorPair {
  background: PaletteColor;
  text: PaletteColor;
}

export interface AlertColors {
  checkMessage: ColorPair;
  preventiveBanner: ColorPair;
  mandatoryBlink: readonly [ColorPair, ColorPair];
  maximumFullScreen: readonly [ColorPair, ColorPair];
}

export interface ThemeColors {
  background: PaletteColor;
  text: PaletteColor;
  border: PaletteColor;
  primaryButton: ColorPair;
  secondaryButton: ColorPair;
  alert: AlertColors;
}

const orangeWithBlackText: ColorPair = { background: palette.alertOrange, text: palette.black };
const blackWithWhiteText: ColorPair = { background: palette.black, text: palette.white };
const blackWithOrangeText: ColorPair = { background: palette.black, text: palette.alertOrange };

export const lightTheme: ThemeColors = {
  background: palette.white,
  text: palette.graphite,
  border: palette.graphite,
  primaryButton: orangeWithBlackText,
  secondaryButton: { background: palette.graphite, text: palette.white },
  alert: {
    checkMessage: { background: palette.graphite, text: palette.white },
    preventiveBanner: orangeWithBlackText,
    mandatoryBlink: [{ background: palette.white, text: palette.graphite }, orangeWithBlackText],
    maximumFullScreen: [blackWithWhiteText, orangeWithBlackText],
  },
};

export const darkTheme: ThemeColors = {
  background: palette.black,
  text: palette.white,
  border: palette.alertOrange,
  primaryButton: orangeWithBlackText,
  secondaryButton: { background: palette.graphite, text: palette.white },
  alert: {
    checkMessage: { background: palette.graphite, text: palette.alertOrange },
    preventiveBanner: orangeWithBlackText,
    mandatoryBlink: [blackWithOrangeText, orangeWithBlackText],
    maximumFullScreen: [blackWithWhiteText, orangeWithBlackText],
  },
};

export function getThemeColors(scheme: ColorSchemeName | null | undefined): ThemeColors {
  return scheme === 'dark' ? darkTheme : lightTheme;
}
