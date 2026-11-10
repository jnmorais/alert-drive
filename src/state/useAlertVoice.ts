import { useEffect } from 'react';

import { deviceVoice } from '../services/speech';
import { connectAlertVoice } from './alertVoice';
import { useTripController } from './TripContext';

export function useAlertVoice(): void {
  const controller = useTripController();

  useEffect(() => connectAlertVoice(controller, deviceVoice), [controller]);
}
