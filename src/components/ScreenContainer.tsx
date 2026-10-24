import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { spacing } from '../theme/typography';
import { useThemeColors } from '../theme/useThemeColors';

interface ScreenContainerProps {
  children: ReactNode;
}

export function ScreenContainer({ children }: ScreenContainerProps) {
  const colors = useThemeColors();
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.large,
    gap: spacing.medium,
  },
});
