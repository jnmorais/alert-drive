import type { TripHistoryStorage } from './tripHistoryStorage';

export async function openDeviceTripHistory(): Promise<TripHistoryStorage> {
  throw new Error('A versão web não grava o histórico no aparelho.');
}
