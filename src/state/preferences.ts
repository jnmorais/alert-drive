import {
  customizeSettings,
  type ProfileSettings,
  type SettingsOverrides,
  type SettingsValidationError,
} from '../core/profiles';
import { VEHICLE_TYPES, type VehicleType } from '../core/types';

export interface Preferences {
  vehicleType: VehicleType;
  overrides: Readonly<Record<VehicleType, SettingsOverrides>>;
}

export type OverridesResult = { ok: true } | { ok: false; errors: SettingsValidationError[] };

export interface PreferencesStore {
  getSnapshot(): Preferences;
  subscribe(listener: () => void): () => void;
  selectVehicle(vehicleType: VehicleType): void;
  setOverrides(vehicleType: VehicleType, overrides: SettingsOverrides): OverridesResult;
  resetOverrides(vehicleType: VehicleType): void;
  restore(preferences: Preferences): void;
}

export interface StoredPreferences {
  vehicleType: string;
  overrides: Readonly<Partial<Record<string, SettingsOverrides>>>;
}

export const DEFAULT_VEHICLE_TYPE: VehicleType = 'car';

function emptyOverrides(): Record<VehicleType, SettingsOverrides> {
  return { truck: {}, bus: {}, car: {} };
}

export function createDefaultPreferences(): Preferences {
  return { vehicleType: DEFAULT_VEHICLE_TYPE, overrides: emptyOverrides() };
}

function isVehicleType(value: string): value is VehicleType {
  return (VEHICLE_TYPES as readonly string[]).includes(value);
}

export function sanitizePreferences(stored: StoredPreferences): Preferences {
  const overrides = emptyOverrides();
  for (const vehicleType of VEHICLE_TYPES) {
    const candidate = stored.overrides[vehicleType];
    if (candidate !== undefined && customizeSettings(vehicleType, candidate).ok) {
      overrides[vehicleType] = { ...candidate };
    }
  }
  return {
    vehicleType: isVehicleType(stored.vehicleType) ? stored.vehicleType : DEFAULT_VEHICLE_TYPE,
    overrides,
  };
}

export function settingsFor(preferences: Preferences, vehicleType: VehicleType = preferences.vehicleType): ProfileSettings {
  const result = customizeSettings(vehicleType, preferences.overrides[vehicleType]);
  if (!result.ok) {
    throw new Error(`Personalização inválida guardada para ${vehicleType}: ${result.errors.join(', ')}`);
  }
  return result.settings;
}

export function createPreferencesStore(initial: Preferences = createDefaultPreferences()): PreferencesStore {
  let snapshot = initial;
  const listeners = new Set<() => void>();

  function publish(next: Preferences): void {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    selectVehicle(vehicleType) {
      if (vehicleType !== snapshot.vehicleType) {
        publish({ ...snapshot, vehicleType });
      }
    },
    setOverrides(vehicleType, overrides) {
      const result = customizeSettings(vehicleType, overrides);
      if (!result.ok) {
        return { ok: false, errors: result.errors };
      }
      publish({ ...snapshot, overrides: { ...snapshot.overrides, [vehicleType]: { ...overrides } } });
      return { ok: true };
    },
    resetOverrides(vehicleType) {
      publish({ ...snapshot, overrides: { ...snapshot.overrides, [vehicleType]: {} } });
    },
    restore(preferences) {
      publish(sanitizePreferences(preferences));
    },
  };
}
