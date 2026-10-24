import { createContext, type ReactNode, useContext, useMemo, useSyncExternalStore } from 'react';

import { browserTimers, createTripController, type TripController, type TripSnapshot } from './tripController';

const TripControllerContext = createContext<TripController | null>(null);

interface TripProviderProps {
  children: ReactNode;
  controller?: TripController;
}

export function TripProvider({ children, controller }: TripProviderProps) {
  const value = useMemo(() => controller ?? createTripController({ timers: browserTimers }), [controller]);
  return <TripControllerContext.Provider value={value}>{children}</TripControllerContext.Provider>;
}

export function useTripController(): TripController {
  const controller = useContext(TripControllerContext);
  if (controller === null) {
    throw new Error('useTripController precisa estar dentro de TripProvider');
  }
  return controller;
}

export function useTripSnapshot(): TripSnapshot {
  const controller = useTripController();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
