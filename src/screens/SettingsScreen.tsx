import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../components/ActionButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { Stepper } from '../components/Stepper';
import { SwitchButton } from '../components/SwitchButton';
import { type AlertChannelState, type ConfigurableChannel, effectiveChannels } from '../core/alertChannels';
import type { SettingsOverrides } from '../core/profiles';
import {
  breakReminderRange,
  canStepSetting,
  checkIntervalRange,
  differsFromDefaults,
  isChannelToggleAvailable,
  isSettingsEditingAllowed,
  isSilenceToggleAvailable,
  type SettingRange,
  type StepDirection,
  stepSetting,
} from '../core/settingsEditing';
import { formatDuration } from '../simulation/format';
import { settingsFor } from '../state/preferences';
import { usePreferences, usePreferencesStore } from '../state/PreferencesContext';
import { useTripController, useTripSnapshot } from '../state/TripContext';
import { VEHICLE_TYPE_LABELS } from '../text/labels';
import {
  breakReminderNote,
  CHANNEL_LABELS,
  channelRestrictionExplanation,
  channelValueLabel,
  CHANNELS_WITHOUT_TRIP,
  CHECK_INTERVAL_NOTE,
  SETTINGS_APPLY_NEXT_TRIP,
  SETTINGS_LOCKED_WHILE_MOVING,
  SILENCE_NOTE,
  silenceButtonLabel,
  VISUAL_CHANNEL_LABEL,
  VISUAL_CHANNEL_VALUE,
} from '../text/settingsText';
import { fontSizes, spacing } from '../theme/typography';
import { useThemeColors } from '../theme/useThemeColors';

const CONFIGURABLE_CHANNELS: readonly ConfigurableChannel[] = ['sound', 'vibration'];

type EditableSetting = 'daytimeCheckInterval' | 'breakReminderAfter';

export default function SettingsScreen() {
  const colors = useThemeColors();
  const preferences = usePreferences();
  const store = usePreferencesStore();
  const controller = useTripController();
  const snapshot = useTripSnapshot();

  const vehicleType = preferences.vehicleType;
  const settings = settingsFor(preferences);
  const channels = snapshot.trip?.channels ?? null;
  const editingAllowed = isSettingsEditingAllowed(controller.responseContext());
  const ranges: Record<EditableSetting, SettingRange> = {
    daytimeCheckInterval: checkIntervalRange(),
    breakReminderAfter: breakReminderRange(vehicleType),
  };

  function changeSetting(setting: EditableSetting, direction: StepDirection): void {
    const overrides: SettingsOverrides = {
      ...preferences.overrides[vehicleType],
      [setting]: stepSetting(settings[setting], ranges[setting], direction),
    };
    store.setOverrides(vehicleType, overrides);
  }

  function stepperProps(setting: EditableSetting) {
    return {
      value: formatDuration(settings[setting]),
      canDecrease: canStepSetting(settings[setting], ranges[setting], 'decrease'),
      canIncrease: canStepSetting(settings[setting], ranges[setting], 'increase'),
      disabled: !editingAllowed,
      onDecrease: () => changeSetting(setting, 'decrease'),
      onIncrease: () => changeSetting(setting, 'increase'),
    };
  }

  function toggleChannel(state: AlertChannelState, channel: ConfigurableChannel): void {
    const enabled = channel === 'sound' ? state.soundEnabled : state.vibrationEnabled;
    controller.setChannel(channel, !enabled);
  }

  const restrictionMessage = channels === null ? null : channelRestrictionExplanation(channels);

  return (
    <ScreenContainer>
      {!editingAllowed && (
        <Text
          accessibilityRole="alert"
          style={[styles.banner, { backgroundColor: colors.primaryButton.background, color: colors.primaryButton.text }]}
        >
          {SETTINGS_LOCKED_WHILE_MOVING}
        </Text>
      )}
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
        {`Perfil: ${VEHICLE_TYPE_LABELS[vehicleType]}`}
      </Text>
      {snapshot.trip !== null && <Text style={[styles.text, { color: colors.text }]}>{SETTINGS_APPLY_NEXT_TRIP}</Text>}
      <Stepper label="Intervalo de verificação" note={CHECK_INTERVAL_NOTE} {...stepperProps('daytimeCheckInterval')} />
      <Stepper label="Lembrete de pausa" note={breakReminderNote(vehicleType)} {...stepperProps('breakReminderAfter')} />
      <ActionButton
        label="Restaurar padrão"
        variant="secondary"
        disabled={!editingAllowed || !differsFromDefaults(vehicleType, settings)}
        onPress={() => store.resetOverrides(vehicleType)}
      />

      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
        Alertas
      </Text>
      {channels === null ? (
        <Text style={[styles.text, { color: colors.text }]}>{CHANNELS_WITHOUT_TRIP}</Text>
      ) : (
        <View style={styles.group}>
          <SwitchButton label={VISUAL_CHANNEL_LABEL} value={VISUAL_CHANNEL_VALUE} checked fixed />
          {CONFIGURABLE_CHANNELS.map((channel) => (
            <SwitchButton
              key={channel}
              label={CHANNEL_LABELS[channel]}
              value={channelValueLabel(channels, channel)}
              checked={effectiveChannels(channels)[channel]}
              disabled={!editingAllowed || !isChannelToggleAvailable(channels, channel)}
              onPress={() => toggleChannel(channels, channel)}
            />
          ))}
          {restrictionMessage !== null && (
            <Text style={[styles.explanation, { color: colors.text, borderColor: colors.border }]}>
              {restrictionMessage}
            </Text>
          )}
          <ActionButton
            label={silenceButtonLabel(channels)}
            variant="secondary"
            disabled={!editingAllowed || !isSilenceToggleAvailable(channels)}
            onPress={() => controller.toggleSilence()}
          />
          <Text style={[styles.text, { color: colors.text }]}>{SILENCE_NOTE}</Text>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: fontSizes.title,
    fontWeight: '700',
  },
  text: {
    fontSize: fontSizes.body,
  },
  group: {
    gap: spacing.medium,
  },
  banner: {
    fontSize: fontSizes.button,
    fontWeight: '700',
    padding: spacing.medium,
    borderRadius: 12,
  },
  explanation: {
    fontSize: fontSizes.body,
    borderWidth: 2,
    borderRadius: 12,
    padding: spacing.medium,
  },
});
