import type { CompletedTrip } from '../../state/tripController';
import type { SqlDatabase } from './sqlDatabase';
import { effectRowValues, rowsToTrip, type TripEventRow, type TripRow, tripRowValues } from './tripRows';

const INSERT_TRIP = `INSERT INTO trips (vehicle_type, started_at, ended_at, utc_offset_minutes, simulation_mode, settings)
VALUES (?, ?, ?, ?, ?, ?)`;

const INSERT_EVENT = 'INSERT INTO trip_events (trip_id, position, type, at, data) VALUES (?, ?, ?, ?, ?)';

export interface TripHistoryStorage {
  loadTrips(): Promise<CompletedTrip[]>;
  saveTrip(trip: CompletedTrip): Promise<void>;
}

function groupEventsByTrip(events: readonly TripEventRow[]): Map<number, TripEventRow[]> {
  const groups = new Map<number, TripEventRow[]>();
  for (const event of events) {
    const group = groups.get(event.trip_id) ?? [];
    group.push(event);
    groups.set(event.trip_id, group);
  }
  return groups;
}

export function createTripHistoryStorage(database: SqlDatabase): TripHistoryStorage {
  return {
    async loadTrips() {
      const trips = await database.getAllAsync<TripRow>('SELECT * FROM trips ORDER BY id', []);
      const events = await database.getAllAsync<TripEventRow>(
        'SELECT trip_id, position, type, at, data FROM trip_events ORDER BY trip_id, position',
        [],
      );
      const eventsByTrip = groupEventsByTrip(events);
      return trips
        .map((trip) => rowsToTrip(trip, eventsByTrip.get(trip.id) ?? []))
        .filter((trip): trip is CompletedTrip => trip !== null);
    },
    async saveTrip(trip) {
      await database.withTransactionAsync(async () => {
        const { lastInsertRowId } = await database.runAsync(INSERT_TRIP, tripRowValues(trip));
        for (const [position, effect] of trip.effects.entries()) {
          await database.runAsync(INSERT_EVENT, effectRowValues(lastInsertRowId, position, effect));
        }
      });
    },
  };
}
