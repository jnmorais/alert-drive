import { createContext, type ReactNode, useContext, useMemo, useSyncExternalStore } from 'react';

import type { Clock } from '../core/types';
import { deviceVoiceRecognition } from '../services/response/deviceVoiceRecognition';
import type { ResponseProvider } from '../services/response/ResponseProvider';
import { createTouchResponseProvider } from '../services/response/touchResponse';
import { createVoiceResponseProvider } from '../services/response/voiceResponse';
import { browserTimers, createTripController, type TripController, type TripSnapshot } from './tripController';

const TripControllerContext = createContext<TripController | null>(null);

function deviceResponseProviders(clock: Clock): ResponseProvider[] {
  return [
    createTouchResponseProvider(clock),
    createVoiceResponseProvider(clock, deviceVoiceRecognition, browserTimers),
  ];
}

interface TripProviderProps {
  children: ReactNode;
  controller?: TripController;
}

export function TripProvider({ children, controller }: TripProviderProps) {
  const value = useMemo(
    () => controller ?? createTripController({ timers: browserTimers, createResponseProviders: deviceResponseProviders }),
    [controller],
  );
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
