import { type Href, useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { ActionButton } from '../components/ActionButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { SCREEN_TITLES } from '../text/screenTitles';
import { fontSizes } from '../theme/typography';
import { useThemeColors } from '../theme/useThemeColors';

const DESTINATIONS: { label: string; href: Href }[] = [
  { label: SCREEN_TITLES.trip, href: '/trip' },
  { label: SCREEN_TITLES.alert, href: '/alert' },
  { label: SCREEN_TITLES.settings, href: '/settings' },
  { label: SCREEN_TITLES.history, href: '/history' },
  { label: SCREEN_TITLES.simulation, href: '/simulation' },
];

export default function ProfileScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        Escolha do perfil em construção.
      </Text>
      {DESTINATIONS.map((destination) => (
        <ActionButton
          key={destination.label}
          label={destination.label}
          variant="secondary"
          onPress={() => router.push(destination.href)}
        />
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSizes.body,
  },
});
