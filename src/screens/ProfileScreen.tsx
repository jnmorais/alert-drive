import { type Href, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../components/ActionButton';
import { OptionButton } from '../components/OptionButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { VEHICLE_TYPES } from '../core/types';
import { settingsFor } from '../state/preferences';
import { usePreferences, usePreferencesStore } from '../state/PreferencesContext';
import { VEHICLE_TYPE_LABELS } from '../text/labels';
import { describeProfileSettings } from '../text/profileSummary';
import { SCREEN_TITLES } from '../text/screenTitles';
import { fontSizes, spacing } from '../theme/typography';
import { useThemeColors } from '../theme/useThemeColors';

const SHORTCUTS: { label: string; href: Href }[] = [
  { label: SCREEN_TITLES.settings, href: '/settings' },
  { label: SCREEN_TITLES.simulation, href: '/simulation' },
  { label: SCREEN_TITLES.history, href: '/history' },
];

export default function ProfileScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const preferences = usePreferences();
  const store = usePreferencesStore();
  const summary = describeProfileSettings(settingsFor(preferences));

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
        Qual veículo você dirige?
      </Text>
      <View accessibilityRole="radiogroup" style={styles.group}>
        {VEHICLE_TYPES.map((vehicleType) => (
          <OptionButton
            key={vehicleType}
            label={VEHICLE_TYPE_LABELS[vehicleType]}
            selected={preferences.vehicleType === vehicleType}
            onPress={() => store.selectVehicle(vehicleType)}
          />
        ))}
      </View>
      <View style={[styles.summary, { borderColor: colors.border }]}>
        {summary.map((line) => (
          <Text key={line.label} style={[styles.summaryLine, { color: colors.text }]}>
            <Text style={styles.summaryLabel}>{line.label}: </Text>
            {line.value}
          </Text>
        ))}
      </View>
      <ActionButton label="Iniciar viagem" onPress={() => router.push('/trip')} />
      {SHORTCUTS.map((shortcut) => (
        <ActionButton
          key={shortcut.label}
          label={shortcut.label}
          variant="secondary"
          onPress={() => router.push(shortcut.href)}
        />
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: fontSizes.title,
    fontWeight: '700',
  },
  group: {
    gap: spacing.small,
  },
  summary: {
    borderWidth: 2,
    borderRadius: 12,
    padding: spacing.medium,
    gap: spacing.small,
  },
  summaryLine: {
    fontSize: fontSizes.body,
  },
  summaryLabel: {
    fontWeight: '700',
  },
});
