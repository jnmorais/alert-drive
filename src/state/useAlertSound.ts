import { useEffect } from 'react';

import { createDeviceAlertSoundPlayer } from '../services/audio';
import { connectAlertSound } from './alertSound';
import { useTripController } from './TripContext';

export function useAlertSound(): void {
  const controller = useTripController();

  useEffect(() => {
    const player = createDeviceAlertSoundPlayer();
    const disconnect = connectAlertSound(controller, player);
    return () => {
      disconnect();
      player.release();
    };
  }, [controller]);
}
