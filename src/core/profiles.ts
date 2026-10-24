import { hours, minutes, seconds } from './duration';
import type { Milliseconds, VehicleType } from './types';

export interface ProfileSettings {
  breakReminderAfter: Milliseconds;
  minimumBreak: Milliseconds;
  breakPreWarningLead: Milliseconds;
  daytimeCheckInterval: Milliseconds;
  reducedCheckInterval: Milliseconds;
  responseWindow: Milliseconds;
  escalationStepDuration: Milliseconds;
  preventiveAlertEnabled: boolean;
}

export interface VehicleProfile {
  vehicleType: VehicleType;
  legalDrivingCeiling: Milliseconds | null;
  defaults: ProfileSettings;
}

export const MIN_CHECK_INTERVAL: Milliseconds = minutes(5);
export const MAX_CHECK_INTERVAL: Milliseconds = minutes(15);

const REDUCED_CHECK_INTERVAL = minutes(5);
const RESPONSE_WINDOW = seconds(15);

export const PROFILES: Readonly<Record<VehicleType, VehicleProfile>> = {
  truck: {
    vehicleType: 'truck',
    legalDrivingCeiling: hours(5.5),
    defaults: {
      breakReminderAfter: hours(5.5),
      minimumBreak: minutes(30),
      breakPreWarningLead: minutes(30),
      daytimeCheckInterval: minutes(10),
      reducedCheckInterval: REDUCED_CHECK_INTERVAL,
      responseWindow: RESPONSE_WINDOW,
      escalationStepDuration: seconds(15),
      preventiveAlertEnabled: true,
    },
  },
  bus: {
    vehicleType: 'bus',
    legalDrivingCeiling: hours(4),
    defaults: {
      breakReminderAfter: hours(4),
      minimumBreak: minutes(30),
      breakPreWarningLead: minutes(30),
      daytimeCheckInterval: minutes(10),
      reducedCheckInterval: REDUCED_CHECK_INTERVAL,
      responseWindow: RESPONSE_WINDOW,
      escalationStepDuration: seconds(10),
      preventiveAlertEnabled: true,
    },
  },
  car: {
    vehicleType: 'car',
    legalDrivingCeiling: null,
    defaults: {
      breakReminderAfter: hours(2),
      minimumBreak: minutes(15),
      breakPreWarningLead: minutes(15),
      daytimeCheckInterval: minutes(15),
      reducedCheckInterval: REDUCED_CHECK_INTERVAL,
      responseWindow: RESPONSE_WINDOW,
      escalationStepDuration: seconds(15),
      preventiveAlertEnabled: true,
    },
  },
};

export function getDefaultSettings(vehicleType: VehicleType): ProfileSettings {
  return { ...PROFILES[vehicleType].defaults };
}

export function getBreakReminderLimit(vehicleType: VehicleType): Milliseconds {
  const profile = PROFILES[vehicleType];
  return profile.legalDrivingCeiling ?? profile.defaults.breakReminderAfter;
}

export interface SettingsOverrides {
  daytimeCheckInterval?: Milliseconds;
  breakReminderAfter?: Milliseconds;
}

export type SettingsValidationError =
  | 'checkIntervalBelowMinimum'
  | 'checkIntervalAboveMaximum'
  | 'breakReminderAboveLimit'
  | 'breakReminderNotAfterPreWarning';

export type CustomizeSettingsResult =
  | { ok: true; settings: ProfileSettings }
  | { ok: false; errors: SettingsValidationError[] };

function validateCheckInterval(interval: Milliseconds): SettingsValidationError[] {
  if (!(interval >= MIN_CHECK_INTERVAL)) {
    return ['checkIntervalBelowMinimum'];
  }
  if (interval > MAX_CHECK_INTERVAL) {
    return ['checkIntervalAboveMaximum'];
  }
  return [];
}

function validateBreakReminder(
  vehicleType: VehicleType,
  breakReminderAfter: Milliseconds,
  breakPreWarningLead: Milliseconds,
): SettingsValidationError[] {
  if (breakReminderAfter > getBreakReminderLimit(vehicleType)) {
    return ['breakReminderAboveLimit'];
  }
  if (!(breakReminderAfter > breakPreWarningLead)) {
    return ['breakReminderNotAfterPreWarning'];
  }
  return [];
}

export function customizeSettings(
  vehicleType: VehicleType,
  overrides: SettingsOverrides,
): CustomizeSettingsResult {
  const defaults = getDefaultSettings(vehicleType);
  const settings: ProfileSettings = {
    ...defaults,
    daytimeCheckInterval: overrides.daytimeCheckInterval ?? defaults.daytimeCheckInterval,
    breakReminderAfter: overrides.breakReminderAfter ?? defaults.breakReminderAfter,
  };
  const errors = [
    ...validateCheckInterval(settings.daytimeCheckInterval),
    ...validateBreakReminder(vehicleType, settings.breakReminderAfter, settings.breakPreWarningLead),
  ];
  return errors.length === 0 ? { ok: true, settings } : { ok: false, errors };
}
