import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { PreferencesProvider } from '../state/PreferencesContext';
import { TripProvider } from '../state/TripContext';
import { TripHistoryProvider } from '../state/TripHistoryContext';
import { useAlertSound } from '../state/useAlertSound';
import { useAlertVibration } from '../state/useAlertVibration';
import { useAlertVoice } from '../state/useAlertVoice';
import { SCREEN_TITLES } from '../text/screenTitles';
import { getThemeColors } from '../theme/colors';
import { fontSizes } from '../theme/typography';

function AlertSound() {
  useAlertSound();
  return null;
}

function AlertVibration() {
  useAlertVibration();
  return null;
}

function AlertVoice() {
  useAlertVoice();
  return null;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const colors = getThemeColors(scheme);
  return (
    <PreferencesProvider>
      <TripProvider>
        <TripHistoryProvider>
          <AlertSound />
          <AlertVibration />
          <AlertVoice />
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
              headerTitleStyle: { fontSize: fontSizes.title },
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" options={{ title: SCREEN_TITLES.profile }} />
            <Stack.Screen name="trip" options={{ title: SCREEN_TITLES.trip }} />
            <Stack.Screen name="alert" options={{ title: SCREEN_TITLES.alert }} />
            <Stack.Screen name="settings" options={{ title: SCREEN_TITLES.settings }} />
            <Stack.Screen name="history" options={{ title: SCREEN_TITLES.history }} />
            <Stack.Screen name="simulation" options={{ title: SCREEN_TITLES.simulation }} />
          </Stack>
        </TripHistoryProvider>
      </TripProvider>
    </PreferencesProvider>
  );
}
