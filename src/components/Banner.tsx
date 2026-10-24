import { StyleSheet, Text } from 'react-native';

import { fontSizes, spacing } from '../theme/typography';
import { useThemeColors } from '../theme/useThemeColors';

interface BannerProps {
  text: string;
}

export function Banner({ text }: BannerProps) {
  const colors = useThemeColors();
  return (
    <Text
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: colors.primaryButton.background, color: colors.primaryButton.text }]}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  banner: {
    fontSize: fontSizes.button,
    fontWeight: '700',
    padding: spacing.medium,
    borderRadius: 12,
  },
});
