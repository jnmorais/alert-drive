import { openDeviceDatabase } from '../database/openDeviceDatabase';
import { createTripHistoryStorage, type TripHistoryStorage } from './tripHistoryStorage';

export async function openDeviceTripHistory(): Promise<TripHistoryStorage> {
  return createTripHistoryStorage(await openDeviceDatabase());
}
