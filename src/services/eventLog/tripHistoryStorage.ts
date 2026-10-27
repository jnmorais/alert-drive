import type { CompletedTrip } from '../../state/tripController';
import type { SqlDatabase } from './sqlDatabase';
import { effectRowValues, rowsToTrip, type TripEventRow, type TripRow, tripRowValues } from './tripRows';

export const DATABASE_NAME = 'alert-drive.db';
export const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_type TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  utc_offset_minutes INTEGER NOT NULL,
  simulation_mode INTEGER NOT NULL,
  settings TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trip_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  type TEXT NOT NULL,
  at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trip_events_by_trip ON trip_events (trip_id, position);
`;

const INSERT_TRIP = `INSERT INTO trips (vehicle_type, started_at, ended_at, utc_offset_minutes, simulation_mode, settings)
VALUES (?, ?, ?, ?, ?, ?)`;

const INSERT_EVENT = 'INSERT INTO trip_events (trip_id, position, type, at, data) VALUES (?, ?, ?, ?, ?)';

export interface TripHistoryStorage {
  loadTrips(): Promise<CompletedTrip[]>;
  saveTrip(trip: CompletedTrip): Promise<void>;
}

export async function migrate(database: SqlDatabase): Promise<void> {
  await database.execAsync('PRAGMA foreign_keys = ON;');
  const current = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  if ((current?.user_version ?? 0) < SCHEMA_VERSION) {
    await database.execAsync(`${SCHEMA}PRAGMA user_version = ${SCHEMA_VERSION};`);
  }
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

export async function createTripHistoryStorage(database: SqlDatabase): Promise<TripHistoryStorage> {
  await migrate(database);
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
