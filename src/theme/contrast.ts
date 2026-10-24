const HEX_COLOR = /^#([0-9a-f]{6})$/i;

export interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

export function parseHexColor(hex: string): RgbColor {
  const match = HEX_COLOR.exec(hex);
  if (!match?.[1]) {
    throw new Error(`Cor inválida: ${hex}`);
  }
  const value = Number.parseInt(match[1], 16);
  return { red: (value >> 16) & 0xff, green: (value >> 8) & 0xff, blue: value & 0xff };
}

function linearize(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { red, green, blue } = parseHexColor(hex);
  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
}

export function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export type HueFamily = 'neutral' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet';

const NEUTRAL_SATURATION_LIMIT = 0.15;

export function hueFamily(hex: string): HueFamily {
  const { red, green, blue } = parseHexColor(hex);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (saturation < NEUTRAL_SATURATION_LIMIT) {
    return 'neutral';
  }
  const delta = max - min;
  let hue: number;
  if (max === red) {
    hue = ((green - blue) / delta) % 6;
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }
  const degrees = (hue * 60 + 360) % 360;
  if (degrees < 15 || degrees >= 330) {
    return 'red';
  }
  if (degrees < 45) {
    return 'orange';
  }
  if (degrees < 70) {
    return 'yellow';
  }
  if (degrees < 170) {
    return 'green';
  }
  if (degrees < 260) {
    return 'blue';
  }
  return 'violet';
}
