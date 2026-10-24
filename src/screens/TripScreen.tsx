import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../components/ActionButton';
import { Banner } from '../components/Banner';
import { ScreenContainer } from '../components/ScreenContainer';
import { describeTripStatus, isTripEndAllowed } from '../core/tripStatus';
import { systemClock } from '../services/systemClock';
import { deviceUtcOffsetMinutes } from '../services/timeZone';
import { settingsFor } from '../state/preferences';
import { usePreferencesStore } from '../state/PreferencesContext';
import { useTripController, useTripSnapshot } from '../state/TripContext';
import { VEHICLE_TYPE_LABELS } from '../text/labels';
import { SCREEN_TITLES } from '../text/screenTitles';
import {
  breakMessage,
  checkMessage,
  formatElapsed,
  intervalMessage,
  movementLabel,
  STOP_RECOMMENDATION,
  stopMessage,
} from '../text/tripText';
import { fontSizes, spacing } from '../theme/typography';
import { useThemeColors } from '../theme/useThemeColors';

const END_LOCKED_WHILE_MOVING = 'Pare o veículo para encerrar a viagem.';

export default function TripScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const controller = useTripController();
  const snapshot = useTripSnapshot();
  const preferencesStore = usePreferencesStore();
  const startRequested = useRef(false);

  useEffect(() => {
    if (startRequested.current || controller.getSnapshot().trip !== null) {
      return;
    }
    startRequested.current = true;
    const preferences = preferencesStore.getSnapshot();
    controller.start({
      vehicleType: preferences.vehicleType,
      settings: settingsFor(preferences),
      utcOffsetMinutes: deviceUtcOffsetMinutes(systemClock),
      clock: systemClock,
      simulationMode: false,
    });
  }, [controller, preferencesStore]);

  const trip = snapshot.trip;
  if (trip === null) {
    return null;
  }

  const status = describeTripStatus(trip, trip.lastUpdateAt);
  const context = controller.responseContext();
  const endAllowed = context === null || isTripEndAllowed(context);
  const breakInfo = breakMessage(status, trip.config.settings.minimumBreak);
  const stop = stopMessage(status);
  const rows = [
    { label: 'Tempo de direção', value: formatElapsed(status.drivingTime) },
    { label: 'Verificação', value: checkMessage(status) },
    { label: 'Intervalo', value: intervalMessage(status.checkInterval) },
  ];

  function endTrip(): void {
    controller.end();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }

  return (
    <ScreenContainer>
      <Text accessibilityRole="header" style={[styles.movement, { color: colors.text }]}>
        {movementLabel(status)}
      </Text>
      <Text style={[styles.profile, { color: colors.text }]}>
        {`${VEHICLE_TYPE_LABELS[trip.config.vehicleType]}${snapshot.simulationMode ? ' · Simulação' : ''}`}
      </Text>
      {status.stopRecommended && <Banner text={STOP_RECOMMENDATION} />}
      {breakInfo.emphasis ? (
        <Banner text={breakInfo.text} />
      ) : (
        <Text style={[styles.breakText, { color: colors.text }]}>{breakInfo.text}</Text>
      )}
      {stop !== null && <Text style={[styles.body, { color: colors.text }]}>{stop}</Text>}
      <View style={[styles.box, { borderColor: colors.border }]}>
        {rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>{row.label}</Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>{row.value}</Text>
          </View>
        ))}
      </View>
      <ActionButton label={SCREEN_TITLES.settings} variant="secondary" onPress={() => router.push('/settings')} />
      <ActionButton label="Encerrar viagem" variant="secondary" disabled={!endAllowed} onPress={endTrip} />
      {!endAllowed && <Text style={[styles.body, { color: colors.text }]}>{END_LOCKED_WHILE_MOVING}</Text>}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  movement: {
    fontSize: fontSizes.headline,
    fontWeight: '700',
  },
  profile: {
    fontSize: fontSizes.body,
  },
  breakText: {
    fontSize: fontSizes.title,
    fontWeight: '700',
  },
  body: {
    fontSize: fontSizes.body,
  },
  box: {
    borderWidth: 2,
    borderRadius: 12,
    padding: spacing.medium,
    gap: spacing.medium,
  },
  row: {
    gap: spacing.small / 2,
  },
  rowLabel: {
    fontSize: fontSizes.body,
  },
  rowValue: {
    fontSize: fontSizes.title,
    fontWeight: '700',
  },
});
