import { openDeviceDatabase } from '../database/openDeviceDatabase';
import { createPreferencesStorage, type PreferencesStorage } from './preferencesStorage';

export async function openDevicePreferences(): Promise<PreferencesStorage> {
  return createPreferencesStorage(await openDeviceDatabase());
}
