import type { SqlDatabase } from '../eventLog/sqlDatabase';

export interface Migration {
  version: number;
  statements: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: `
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
`,
  },
  {
    version: 2,
    statements: `
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  vehicle_type TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profile_overrides (
  vehicle_type TEXT PRIMARY KEY,
  daytime_check_interval INTEGER,
  break_reminder_after INTEGER
);
`,
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce((latest, migration) => Math.max(latest, migration.version), 0);

export async function currentSchemaVersion(database: SqlDatabase): Promise<number> {
  const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  return row?.user_version ?? 0;
}

export async function migrateDatabase(
  database: SqlDatabase,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<void> {
  await database.execAsync('PRAGMA foreign_keys = ON;');
  const current = await currentSchemaVersion(database);
  const pending = migrations.filter((migration) => migration.version > current);
  for (const migration of pending) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(migration.statements);
      await database.execAsync(`PRAGMA user_version = ${migration.version};`);
    });
  }
}
