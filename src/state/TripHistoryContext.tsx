import { createContext, type ReactNode, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

import { openDeviceTripHistory } from '../services/eventLog/openDeviceTripHistory';
import { createTripHistoryStore, recordCompletedTrips, type TripHistorySnapshot, type TripHistoryStore } from './tripHistory';
import { useTripController } from './TripContext';

const TripHistoryContext = createContext<TripHistoryStore | null>(null);

interface TripHistoryProviderProps {
  children: ReactNode;
  store?: TripHistoryStore;
}

export function TripHistoryProvider({ children, store }: TripHistoryProviderProps) {
  const controller = useTripController();
  const value = useMemo(() => store ?? createTripHistoryStore(openDeviceTripHistory), [store]);
  useEffect(() => recordCompletedTrips(controller, value), [controller, value]);
  return <TripHistoryContext.Provider value={value}>{children}</TripHistoryContext.Provider>;
}

export function useTripHistory(): TripHistorySnapshot {
  const store = useContext(TripHistoryContext);
  if (store === null) {
    throw new Error('useTripHistory precisa estar dentro de TripHistoryProvider');
  }
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
