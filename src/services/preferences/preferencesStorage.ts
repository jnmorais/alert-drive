import type { SettingsOverrides } from '../../core/profiles';
import { VEHICLE_TYPES } from '../../core/types';
import { type Preferences, sanitizePreferences } from '../../state/preferences';
import type { SqlDatabase } from '../eventLog/sqlDatabase';

interface AppSettingsRow {
  vehicle_type: string;
}

interface ProfileOverrideRow {
  vehicle_type: string;
  daytime_check_interval: number | null;
  break_reminder_after: number | null;
}

export interface PreferencesStorage {
  load(): Promise<Preferences | null>;
  save(preferences: Preferences): Promise<void>;
}

const SAVE_VEHICLE_TYPE = `INSERT INTO app_settings (id, vehicle_type) VALUES (1, ?)
ON CONFLICT(id) DO UPDATE SET vehicle_type = excluded.vehicle_type`;

const INSERT_OVERRIDE =
  'INSERT INTO profile_overrides (vehicle_type, daytime_check_interval, break_reminder_after) VALUES (?, ?, ?)';

function rowToOverrides(row: ProfileOverrideRow): SettingsOverrides {
  const overrides: SettingsOverrides = {};
  if (row.daytime_check_interval !== null) {
    overrides.daytimeCheckInterval = row.daytime_check_interval;
  }
  if (row.break_reminder_after !== null) {
    overrides.breakReminderAfter = row.break_reminder_after;
  }
  return overrides;
}

function hasOverrides(overrides: SettingsOverrides): boolean {
  return overrides.daytimeCheckInterval !== undefined || overrides.breakReminderAfter !== undefined;
}

export function createPreferencesStorage(database: SqlDatabase): PreferencesStorage {
  return {
    async load() {
      const settings = await database.getFirstAsync<AppSettingsRow>('SELECT vehicle_type FROM app_settings WHERE id = 1', []);
      if (settings === null) {
        return null;
      }
      const rows = await database.getAllAsync<ProfileOverrideRow>(
        'SELECT vehicle_type, daytime_check_interval, break_reminder_after FROM profile_overrides',
        [],
      );
      return sanitizePreferences({
        vehicleType: settings.vehicle_type,
        overrides: Object.fromEntries(rows.map((row) => [row.vehicle_type, rowToOverrides(row)])),
      });
    },
    async save(preferences) {
      await database.withTransactionAsync(async () => {
        await database.runAsync(SAVE_VEHICLE_TYPE, [preferences.vehicleType]);
        await database.runAsync('DELETE FROM profile_overrides', []);
        for (const vehicleType of VEHICLE_TYPES) {
          const overrides = preferences.overrides[vehicleType];
          if (hasOverrides(overrides)) {
            await database.runAsync(INSERT_OVERRIDE, [
              vehicleType,
              overrides.daytimeCheckInterval ?? null,
              overrides.breakReminderAfter ?? null,
            ]);
          }
        }
      });
    },
  };
}
