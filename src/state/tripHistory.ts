import type { TripHistoryStorage } from '../services/eventLog/tripHistoryStorage';
import type { CompletedTrip, TripController } from './tripController';

export type TripHistoryStatus = 'loading' | 'saved' | 'memoryOnly';

export interface TripHistorySnapshot {
  status: TripHistoryStatus;
  trips: readonly CompletedTrip[];
}

export interface TripHistoryStore {
  getSnapshot(): TripHistorySnapshot;
  subscribe(listener: () => void): () => void;
  add(trip: CompletedTrip): Promise<void>;
  ready(): Promise<void>;
}

export function createTripHistoryStore(openStorage: () => Promise<TripHistoryStorage>): TripHistoryStore {
  let snapshot: TripHistorySnapshot = { status: 'loading', trips: [] };
  const listeners = new Set<() => void>();

  function publish(next: TripHistorySnapshot): void {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function fallBackToMemory(): void {
    publish({ ...snapshot, status: 'memoryOnly' });
  }

  const storage: Promise<TripHistoryStorage | null> = openStorage()
    .then(async (opened) => {
      const stored = await opened.loadTrips();
      publish({ status: 'saved', trips: [...stored, ...snapshot.trips] });
      return opened;
    })
    .catch(() => {
      fallBackToMemory();
      return null;
    });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async add(trip) {
      publish({ ...snapshot, trips: [...snapshot.trips, trip] });
      const opened = await storage;
      if (opened === null) {
        return;
      }
      try {
        await opened.saveTrip(trip);
      } catch {
        fallBackToMemory();
      }
    },
    async ready() {
      await storage;
    },
  };
}

export function recordCompletedTrips(
  controller: Pick<TripController, 'getSnapshot' | 'subscribe'>,
  history: Pick<TripHistoryStore, 'add'>,
): () => void {
  let recorded = controller.getSnapshot().completedTrips.length;
  return controller.subscribe(() => {
    const completed = controller.getSnapshot().completedTrips;
    completed.slice(recorded).forEach((trip) => void history.add(trip));
    recorded = completed.length;
  });
}
