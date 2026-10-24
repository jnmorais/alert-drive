import { useColorScheme } from 'react-native';

import { getThemeColors, type ThemeColors } from './colors';

export function useThemeColors(): ThemeColors {
  return getThemeColors(useColorScheme());
}
