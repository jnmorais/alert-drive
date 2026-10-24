import { StyleSheet, Text } from 'react-native';

import { fontSizes } from '../theme/typography';
import { useThemeColors } from '../theme/useThemeColors';
import { ScreenContainer } from './ScreenContainer';

interface PlaceholderScreenProps {
  title: string;
}

export function PlaceholderScreen({ title }: PlaceholderScreenProps) {
  const colors = useThemeColors();
  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {title}
      </Text>
      <Text style={[styles.body, { color: colors.text }]}>Tela em construção.</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSizes.title,
    fontWeight: '700',
  },
  body: {
    fontSize: fontSizes.body,
  },
});
