import { afterEach, describe, expect, it } from '@jest/globals';

import { hours, minutes } from '../../core/duration';
import { createDefaultPreferences, type Preferences } from '../../state/preferences';
import { createNodeSqliteDatabase, type TestDatabase } from '../../testing/nodeSqliteDatabase';
import { migrateDatabase } from '../database/migrations';
import { createPreferencesStorage } from './preferencesStorage';

let database: TestDatabase;

afterEach(() => {
  database.close();
});

async function createMigratedDatabase(): Promise<TestDatabase> {
  const created = createNodeSqliteDatabase();
  await migrateDatabase(created);
  return created;
}

const customized: Preferences = {
  vehicleType: 'truck',
  overrides: {
    truck: { daytimeCheckInterval: minutes(7), breakReminderAfter: hours(5) },
    bus: { breakReminderAfter: hours(3) },
    car: {},
  },
};

describe('RF01 e RF02 - preferências gravadas no banco do aparelho', () => {
  it('não há preferências gravadas na primeira abertura', async () => {
    database = await createMigratedDatabase();
    expect(await createPreferencesStorage(database).load()).toBeNull();
  });

  it('grava e lê de volta o perfil e as personalizações de cada perfil', async () => {
    database = await createMigratedDatabase();
    const storage = createPreferencesStorage(database);
    await storage.save(customized);
    expect(await storage.load()).toEqual(customized);
  });

  it('gravar de novo substitui as preferências anteriores', async () => {
    database = await createMigratedDatabase();
    const storage = createPreferencesStorage(database);
    await storage.save(customized);
    await storage.save(createDefaultPreferences());
    expect(await storage.load()).toEqual(createDefaultPreferences());
    const rows = await database.getAllAsync<{ total: number }>('SELECT COUNT(*) AS total FROM profile_overrides', []);
    expect(rows[0]?.total).toBe(0);
  });

  it('guarda uma linha por perfil personalizado, com colunas vazias para o que não mudou', async () => {
    database = await createMigratedDatabase();
    await createPreferencesStorage(database).save(customized);
    const rows = await database.getAllAsync<Record<string, unknown>>(
      'SELECT vehicle_type, daytime_check_interval, break_reminder_after FROM profile_overrides ORDER BY vehicle_type',
      [],
    );
    expect(rows).toEqual([
      { vehicle_type: 'bus', daytime_check_interval: null, break_reminder_after: hours(3) },
      { vehicle_type: 'truck', daytime_check_interval: minutes(7), break_reminder_after: hours(5) },
    ]);
  });

  it('valida o que estava gravado: perfil desconhecido e personalização inválida voltam ao padrão', async () => {
    database = await createMigratedDatabase();
    await database.runAsync('INSERT INTO app_settings (id, vehicle_type) VALUES (1, ?)', ['moto']);
    await database.runAsync(
      'INSERT INTO profile_overrides (vehicle_type, daytime_check_interval, break_reminder_after) VALUES (?, ?, ?)',
      ['car', minutes(20), null],
    );
    expect(await createPreferencesStorage(database).load()).toEqual(createDefaultPreferences());
  });
});
