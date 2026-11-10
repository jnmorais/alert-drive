import { useEffect, useSyncExternalStore } from 'react';

import { deviceVoiceRecognition } from '../services/response/deviceVoiceRecognition';
import type { VoiceReadiness } from '../services/response/voiceResponse';
import { useTripController } from './TripContext';
import { connectVoicePreparation } from './voicePreparation';

export function usePrepareVoiceOnTripStart(): void {
  const controller = useTripController();

  useEffect(() => connectVoicePreparation(controller, deviceVoiceRecognition), [controller]);
}

export function useVoiceReadiness(): VoiceReadiness {
  return useSyncExternalStore(
    deviceVoiceRecognition.subscribe,
    deviceVoiceRecognition.getReadiness,
    deviceVoiceRecognition.getReadiness,
  );
}
