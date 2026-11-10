import { GPS_SIGNAL_TIMEOUT, type LocationReading, speedKmhFromReading } from '../core/gpsSpeed';
import type { CancelTimer, TimerScheduler, TripController } from './tripController';

export type LocationPermission = 'granted' | 'denied' | 'servicesOff';

export interface LocationSource {
  requestPermission(): Promise<LocationPermission>;
  watch(onReading: (reading: LocationReading) => void): Promise<() => void>;
}

export type GpsStatus =
  | { state: 'inactive' }
  | { state: 'requesting' }
  | { state: 'denied' }
  | { state: 'servicesOff' }
  | { state: 'waiting' }
  | { state: 'tracking'; speedKmh: number }
  | { state: 'error' };

export interface GpsTracker {
  getSnapshot(): GpsStatus;
  subscribe(listener: () => void): () => void;
  connect(): () => void;
}

export interface GpsTrackerOptions {
  controller: Pick<TripController, 'getSnapshot' | 'subscribe' | 'pushSpeedSample'>;
  source: LocationSource;
  timers: TimerScheduler;
}

const INACTIVE: GpsStatus = { state: 'inactive' };

export function createGpsTracker({ controller, source, timers }: GpsTrackerOptions): GpsTracker {
  let status: GpsStatus = INACTIVE;
  let session: number | null = null;
  let stopWatching: (() => void) | null = null;
  let cancelSignalTimeout: CancelTimer | null = null;
  const listeners = new Set<() => void>();

  function publish(next: GpsStatus): void {
    status = next;
    listeners.forEach((listener) => listener());
  }

  function clearSignalTimeout(): void {
    cancelSignalTimeout?.();
    cancelSignalTimeout = null;
  }

  function trackedTripStart(): number | null {
    const { trip, simulationMode } = controller.getSnapshot();
    return trip === null || simulationMode ? null : trip.config.startedAt;
  }

  function release(): void {
    clearSignalTimeout();
    stopWatching?.();
    stopWatching = null;
    session = null;
  }

  function handleReading(owner: number, reading: LocationReading): void {
    if (session !== owner) {
      return;
    }
    const speedKmh = speedKmhFromReading(reading);
    if (speedKmh === null) {
      return;
    }
    controller.pushSpeedSample(speedKmh);
    clearSignalTimeout();
    cancelSignalTimeout = timers.schedule(() => {
      cancelSignalTimeout = null;
      publish({ state: 'waiting' });
    }, GPS_SIGNAL_TIMEOUT);
    publish({ state: 'tracking', speedKmh });
  }

  async function begin(owner: number): Promise<void> {
    publish({ state: 'requesting' });
    try {
      const permission = await source.requestPermission();
      if (session !== owner) {
        return;
      }
      if (permission !== 'granted') {
        publish({ state: permission });
        return;
      }
      publish({ state: 'waiting' });
      const remove = await source.watch((reading) => handleReading(owner, reading));
      if (session !== owner) {
        remove();
        return;
      }
      stopWatching = remove;
    } catch {
      if (session === owner) {
        publish({ state: 'error' });
      }
    }
  }

  function sync(): void {
    const tripStart = trackedTripStart();
    if (tripStart === session) {
      return;
    }
    release();
    if (tripStart === null) {
      publish(INACTIVE);
      return;
    }
    session = tripStart;
    void begin(tripStart);
  }

  return {
    getSnapshot: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect() {
      const unsubscribe = controller.subscribe(sync);
      sync();
      return () => {
        unsubscribe();
        release();
      };
    },
  };
}
