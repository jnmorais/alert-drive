import { createContext, type ReactNode, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

import { deviceLocationSource } from '../services/location';
import { createGpsTracker, type GpsStatus, type GpsTracker } from './gpsTracker';
import { useTripController } from './TripContext';
import { browserTimers } from './tripController';

const GpsTrackerContext = createContext<GpsTracker | null>(null);

export function GpsProvider({ children }: { children: ReactNode }) {
  const controller = useTripController();
  const value = useMemo(
    () => createGpsTracker({ controller, source: deviceLocationSource, timers: browserTimers }),
    [controller],
  );
  useEffect(() => value.connect(), [value]);
  return <GpsTrackerContext.Provider value={value}>{children}</GpsTrackerContext.Provider>;
}

export function useGpsStatus(): GpsStatus {
  const tracker = useContext(GpsTrackerContext);
  if (tracker === null) {
    throw new Error('useGpsStatus precisa estar dentro de GpsProvider');
  }
  return useSyncExternalStore(tracker.subscribe, tracker.getSnapshot, tracker.getSnapshot);
}
