import * as Location from 'expo-location';

import { seconds } from '../core/duration';
import type { LocationSource } from '../state/gpsTracker';

export const GPS_READING_INTERVAL = seconds(1);

export const deviceLocationSource: LocationSource = {
  async requestPermission() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) {
      return 'denied';
    }
    return (await Location.hasServicesEnabledAsync()) ? 'granted' : 'servicesOff';
  },
  async watch(onReading) {
    const subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: GPS_READING_INTERVAL, distanceInterval: 0 },
      (location) => onReading({ at: location.timestamp, speedMetersPerSecond: location.coords.speed }),
    );
    return () => subscription.remove();
  },
};
