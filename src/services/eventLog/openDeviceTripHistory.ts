import { openDatabaseAsync } from 'expo-sqlite';

import { createTripHistoryStorage, DATABASE_NAME, type TripHistoryStorage } from './tripHistoryStorage';

export async function openDeviceTripHistory(): Promise<TripHistoryStorage> {
  return createTripHistoryStorage(await openDatabaseAsync(DATABASE_NAME));
}
