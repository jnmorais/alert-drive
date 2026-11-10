import { useEffect } from 'react';

import { deviceVibrator } from '../services/haptics';
import { connectAlertVibration } from './alertVibration';
import { useTripController } from './TripContext';

export function useAlertVibration(): void {
  const controller = useTripController();

  useEffect(() => connectAlertVibration(controller, deviceVibrator), [controller]);
}
