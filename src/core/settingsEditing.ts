import { type AlertChannelState, canDisableChannel, canSilence, type ConfigurableChannel } from './alertChannels';
import { minutes } from './duration';
import {
  getBreakReminderLimit,
  getDefaultSettings,
  MAX_CHECK_INTERVAL,
  MIN_CHECK_INTERVAL,
  type ProfileSettings,
} from './profiles';
import { isResponseMethodAllowed, type ResponseContext } from './responsePolicy';
import type { Milliseconds, VehicleType } from './types';

export interface SettingRange {
  min: Milliseconds;
  max: Milliseconds;
  step: Milliseconds;
}

export type StepDirection = 'decrease' | 'increase';

export const CHECK_INTERVAL_STEP: Milliseconds = minutes(1);
export const BREAK_REMINDER_STEP: Milliseconds = minutes(15);

export function checkIntervalRange(): SettingRange {
  return { min: MIN_CHECK_INTERVAL, max: MAX_CHECK_INTERVAL, step: CHECK_INTERVAL_STEP };
}

export function breakReminderRange(vehicleType: VehicleType): SettingRange {
  return {
    min: getDefaultSettings(vehicleType).breakPreWarningLead + BREAK_REMINDER_STEP,
    max: getBreakReminderLimit(vehicleType),
    step: BREAK_REMINDER_STEP,
  };
}

export function canStepSetting(value: Milliseconds, range: SettingRange, direction: StepDirection): boolean {
  return direction === 'increase' ? value < range.max : value > range.min;
}

export function stepSetting(value: Milliseconds, range: SettingRange, direction: StepDirection): Milliseconds {
  const next = direction === 'increase' ? value + range.step : value - range.step;
  return Math.min(range.max, Math.max(range.min, next));
}

export function differsFromDefaults(vehicleType: VehicleType, settings: ProfileSettings): boolean {
  const defaults = getDefaultSettings(vehicleType);
  return (
    settings.daytimeCheckInterval !== defaults.daytimeCheckInterval ||
    settings.breakReminderAfter !== defaults.breakReminderAfter
  );
}

export function isChannelToggleAvailable(state: AlertChannelState, channel: ConfigurableChannel): boolean {
  const enabled = channel === 'sound' ? state.soundEnabled : state.vibrationEnabled;
  return !enabled || canDisableChannel(state, channel);
}

export function isSilenceToggleAvailable(state: AlertChannelState): boolean {
  return state.silenced || (state.soundEnabled && canSilence(state));
}

export function isSettingsEditingAllowed(context: ResponseContext | null): boolean {
  return context === null || isResponseMethodAllowed('touch', context);
}
