import { openDatabaseAsync } from 'expo-sqlite';

import type { SqlDatabase } from '../eventLog/sqlDatabase';
import { migrateDatabase } from './migrations';
import { serializeTransactions } from './serializeTransactions';

export const DATABASE_NAME = 'alert-drive.db';

let opening: Promise<SqlDatabase> | null = null;

async function openAndMigrate(): Promise<SqlDatabase> {
  const database = serializeTransactions(await openDatabaseAsync(DATABASE_NAME));
  await migrateDatabase(database);
  return database;
}

export function openDeviceDatabase(): Promise<SqlDatabase> {
  opening ??= openAndMigrate();
  return opening;
}
