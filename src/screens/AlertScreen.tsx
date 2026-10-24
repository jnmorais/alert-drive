import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../components/ActionButton';
import { describeActiveAlert } from '../core/alertView';
import type { ResponseMethod } from '../core/responsePolicy';
import type { ResponseProvider } from '../services/response/ResponseProvider';
import type { TouchResponseProvider } from '../services/response/touchResponse';
import { useTripController, useTripSnapshot } from '../state/TripContext';
import { ALERT_SCREEN_MESSAGES, responseInstruction, TOUCH_RESPONSE_LABEL } from '../text/alertText';
import { ALERT_STAGE_LABELS } from '../text/labels';
import { alertColorPair } from '../theme/alertColors';
import { fontSizes, spacing } from '../theme/typography';
import { useBlinkFrame } from '../theme/useBlinkFrame';
import { useThemeColors } from '../theme/useThemeColors';

const RESPONSE_METHODS: readonly ResponseMethod[] = ['touch', 'voice', 'proximity'];

function isTouchProvider(provider: ResponseProvider | undefined): provider is TouchResponseProvider {
  return provider !== undefined && provider.method === 'touch' && 'press' in provider;
}

export default function AlertScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const controller = useTripController();
  const snapshot = useTripSnapshot();
  const context = controller.responseContext();
  const supported = RESPONSE_METHODS.filter((method) => controller.responseProvider(method) !== undefined);
  const view = snapshot.trip !== null && context !== null ? describeActiveAlert(snapshot.trip, context, supported) : null;
  const fillsScreen = view?.visual === 'blinking' || view?.visual === 'fullScreen';
  const frame = useBlinkFrame(fillsScreen);
  const alertActive = view !== null;

  useEffect(() => {
    if (alertActive) {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => subscription.remove();
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/trip');
    }
  }, [alertActive, router]);

  if (view === null || context === null) {
    return <Stack.Screen options={{ headerShown: false }} />;
  }

  const pair = alertColorPair(colors.alert, view.stage, frame);
  const messageStyle = MESSAGE_STYLES[view.visual];

  const respondByTouch = (): void => {
    const provider = controller.responseProvider('touch');
    if (isTouchProvider(provider)) {
      provider.press(context);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View
        style={[
          styles.alertArea,
          fillsScreen ? { backgroundColor: pair.background } : { backgroundColor: colors.background },
        ]}
      >
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={[styles.card, { backgroundColor: pair.background }]}
        >
          <Text style={[styles.stage, { color: pair.text }]}>{ALERT_STAGE_LABELS[view.stage]}</Text>
          <Text style={[messageStyle, { color: pair.text }]}>{ALERT_SCREEN_MESSAGES[view.stage]}</Text>
        </View>
      </View>
      <View style={[styles.responseArea, { backgroundColor: colors.background }]}>
        <Text style={[styles.instruction, { color: colors.text }]}>{responseInstruction(view)}</Text>
        {view.touchAllowed && <ActionButton label={TOUCH_RESPONSE_LABEL} onPress={respondByTouch} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  alertArea: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.large,
  },
  card: {
    borderRadius: 16,
    padding: spacing.large,
    gap: spacing.medium,
  },
  stage: {
    fontSize: fontSizes.body,
    fontWeight: '700',
  },
  message: {
    fontSize: fontSizes.title,
    fontWeight: '700',
  },
  messageLarge: {
    fontSize: fontSizes.headline,
    fontWeight: '700',
  },
  messageMaximum: {
    fontSize: fontSizes.headline + 8,
    fontWeight: '800',
  },
  responseArea: {
    padding: spacing.large,
    gap: spacing.medium,
  },
  instruction: {
    fontSize: fontSizes.body,
    fontWeight: '700',
  },
});

const MESSAGE_STYLES = {
  message: styles.message,
  fixedBanner: styles.message,
  blinking: styles.messageLarge,
  fullScreen: styles.messageMaximum,
};
