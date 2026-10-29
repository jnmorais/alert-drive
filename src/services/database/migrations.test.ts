import { afterEach, describe, expect, it } from '@jest/globals';

import { createNodeSqliteDatabase, type TestDatabase } from '../../testing/nodeSqliteDatabase';
import { currentSchemaVersion, LATEST_SCHEMA_VERSION, MIGRATIONS, migrateDatabase } from './migrations';
import { serializeTransactions } from './serializeTransactions';

let database: TestDatabase;

afterEach(() => {
  database.close();
});

async function tableNames(target: TestDatabase): Promise<string[]> {
  const rows = await target.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    [],
  );
  return rows.map((row) => row.name);
}

async function count(target: TestDatabase, table: string): Promise<number> {
  const row = await target.getFirstAsync<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`, []);
  return row?.total ?? -1;
}

describe('RF12 - versões do esquema do banco do aparelho', () => {
  it('um banco novo recebe todas as tabelas e a versão mais recente', async () => {
    database = createNodeSqliteDatabase();
    await migrateDatabase(database);
    expect(LATEST_SCHEMA_VERSION).toBe(2);
    expect(await currentSchemaVersion(database)).toBe(LATEST_SCHEMA_VERSION);
    expect(await tableNames(database)).toEqual(['app_settings', 'profile_overrides', 'trip_events', 'trips']);
  });

  it('um banco na versão 1 ganha as tabelas novas sem perder as viagens', async () => {
    database = createNodeSqliteDatabase();
    await migrateDatabase(database, MIGRATIONS.slice(0, 1));
    await database.runAsync(
      'INSERT INTO trips (vehicle_type, started_at, ended_at, utc_offset_minutes, simulation_mode, settings) VALUES (?, ?, ?, ?, ?, ?)',
      ['car', 1, 2, -180, 1, '{}'],
    );
    expect(await currentSchemaVersion(database)).toBe(1);
    await migrateDatabase(database);
    expect(await currentSchemaVersion(database)).toBe(2);
    expect(await count(database, 'trips')).toBe(1);
    expect(await tableNames(database)).toContain('app_settings');
  });

  it('migrar de novo não muda nada', async () => {
    database = createNodeSqliteDatabase();
    await migrateDatabase(database);
    await database.runAsync('INSERT INTO app_settings (id, vehicle_type) VALUES (1, ?)', ['bus']);
    await migrateDatabase(database);
    expect(await count(database, 'app_settings')).toBe(1);
  });

  it('uma migração que falha não deixa nada pela metade nem avança a versão', async () => {
    database = createNodeSqliteDatabase();
    const broken = [
      ...MIGRATIONS,
      { version: 3, statements: 'CREATE TABLE half_done (id INTEGER); SELECT * FROM missing_table;' },
    ];
    await expect(migrateDatabase(database, broken)).rejects.toThrow();
    expect(await currentSchemaVersion(database)).toBe(2);
    expect(await tableNames(database)).not.toContain('half_done');
  });

  it('a configuração do aplicativo só aceita uma linha', async () => {
    database = createNodeSqliteDatabase();
    await migrateDatabase(database);
    await expect(
      database.runAsync('INSERT INTO app_settings (id, vehicle_type) VALUES (2, ?)', ['car']),
    ).rejects.toThrow();
  });
});

describe('RF12 - transações em fila na conexão compartilhada', () => {
  async function slowInsert(target: TestDatabase | ReturnType<typeof serializeTransactions>, value: string) {
    await target.withTransactionAsync(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await target.runAsync('INSERT INTO app_settings (id, vehicle_type) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET vehicle_type = excluded.vehicle_type', [value]);
    });
  }

  it('sem fila, duas transações ao mesmo tempo na mesma conexão falham', async () => {
    database = createNodeSqliteDatabase();
    await migrateDatabase(database);
    const results = await Promise.allSettled([slowInsert(database, 'car'), slowInsert(database, 'bus')]);
    expect(results.some((result) => result.status === 'rejected')).toBe(true);
  });

  it('com fila, as duas transações terminam, na ordem em que foram pedidas', async () => {
    database = createNodeSqliteDatabase();
    await migrateDatabase(database);
    const serialized = serializeTransactions(database);
    await Promise.all([slowInsert(serialized, 'car'), slowInsert(serialized, 'bus')]);
    const row = await serialized.getFirstAsync<{ vehicle_type: string }>('SELECT vehicle_type FROM app_settings', []);
    expect(row?.vehicle_type).toBe('bus');
  });

  it('uma transação que falha não trava as seguintes', async () => {
    database = createNodeSqliteDatabase();
    await migrateDatabase(database);
    const serialized = serializeTransactions(database);
    const failing = serialized.withTransactionAsync(async () => {
      throw new Error('falha simulada');
    });
    const next = slowInsert(serialized, 'truck');
    await expect(failing).rejects.toThrow('falha simulada');
    await next;
    await serialized.execAsync('SELECT 1;');
    expect(await serialized.getAllAsync<{ vehicle_type: string }>('SELECT vehicle_type FROM app_settings', [])).toEqual([
      { vehicle_type: 'truck' },
    ]);
  });
});
