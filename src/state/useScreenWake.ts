import { useEffect } from 'react';

import { deviceScreenWake } from '../services/screenWake';
import { connectScreenWake } from './screenWake';
import { useTripController } from './TripContext';

export function useScreenWake(): void {
  const controller = useTripController();

  useEffect(() => connectScreenWake(controller, deviceScreenWake), [controller]);
}
