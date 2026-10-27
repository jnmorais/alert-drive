import { afterEach, describe, expect, it } from '@jest/globals';

import { minutes, seconds } from '../../core/duration';
import { getDefaultSettings } from '../../core/profiles';
import type { TripEffect } from '../../core/trip';
import { runScenario, SCENARIOS } from '../../simulation/scenarios';
import type { CompletedTrip } from '../../state/tripController';
import { createNodeSqliteDatabase, type TestDatabase } from '../../testing/nodeSqliteDatabase';
import { createTripHistoryStorage, migrate, SCHEMA_VERSION } from './tripHistoryStorage';

const START = Date.UTC(2026, 9, 24, 12, 0);

let database: TestDatabase;

afterEach(() => {
  database.close();
});

function sampleTrip(overrides: Partial<CompletedTrip> = {}): CompletedTrip {
  const effects: TripEffect[] = [
    { type: 'checkStarted', at: START + minutes(15), interval: minutes(15), reasons: [] },
    { type: 'stageEntered', at: START + minutes(15) + seconds(15), stage: 'preventive' },
    {
      type: 'checkResolved',
      at: START + minutes(15) + seconds(20),
      outcome: {
        respondedAt: START + minutes(15) + seconds(20),
        responseTime: seconds(20),
        maxStage: 'preventive',
        simulatedLevel: 7,
      },
    },
    { type: 'breakRegistered', at: START + minutes(50), stoppedSince: START + minutes(35) },
  ];
  return {
    config: { vehicleType: 'car', settings: getDefaultSettings('car'), utcOffsetMinutes: -180, startedAt: START },
    simulationMode: true,
    endedAt: START + minutes(60),
    effects,
    ...overrides,
  };
}

describe('RF12 - histórico gravado no banco SQLite do aparelho', () => {
  it('começa vazio', async () => {
    database = createNodeSqliteDatabase();
    const storage = await createTripHistoryStorage(database);
    expect(await storage.loadTrips()).toEqual([]);
  });

  it('grava e lê de volta a viagem com perfil, horários, configurações e eventos', async () => {
    database = createNodeSqliteDatabase();
    const storage = await createTripHistoryStorage(database);
    const trip = sampleTrip();
    await storage.saveTrip(trip);
    expect(await storage.loadTrips()).toEqual([trip]);
  });

  it('guarda as viagens na ordem em que foram encerradas', async () => {
    database = createNodeSqliteDatabase();
    const storage = await createTripHistoryStorage(database);
    const first = sampleTrip();
    const second = sampleTrip({
      config: { ...sampleTrip().config, vehicleType: 'truck', startedAt: START + minutes(90) },
      simulationMode: false,
      effects: [],
    });
    await storage.saveTrip(first);
    await storage.saveTrip(second);
    const loaded = await storage.loadTrips();
    expect(loaded.map((trip) => trip.config.vehicleType)).toEqual(['car', 'truck']);
    expect(loaded[1]?.effects).toEqual([]);
    expect(loaded[1]?.simulationMode).toBe(false);
  });

  it('mantém o histórico ao abrir o banco de novo', async () => {
    database = createNodeSqliteDatabase();
    await (await createTripHistoryStorage(database)).saveTrip(sampleTrip());
    const reopened = await createTripHistoryStorage(database);
    expect(await reopened.loadTrips()).toHaveLength(1);
  });

  it('guarda sem perda uma viagem simulada completa', async () => {
    database = createNodeSqliteDatabase();
    const storage = await createTripHistoryStorage(database);
    const run = runScenario(SCENARIOS[5]!, 'bus');
    const trip: CompletedTrip = {
      config: run.finalTrip.config,
      simulationMode: true,
      endedAt: run.endedAt,
      effects: run.effects,
    };
    await storage.saveTrip(trip);
    expect(await storage.loadTrips()).toEqual([trip]);
  });

  it('não grava nada da viagem se a gravação falhar no meio', async () => {
    database = createNodeSqliteDatabase();
    const storage = await createTripHistoryStorage(database);
    await database.execAsync(
      "CREATE TRIGGER reject_break BEFORE INSERT ON trip_events WHEN NEW.type = 'breakRegistered' BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;",
    );
    await expect(storage.saveTrip(sampleTrip())).rejects.toThrow('falha simulada');
    const trips = await database.getAllAsync<{ total: number }>('SELECT COUNT(*) AS total FROM trips', []);
    const events = await database.getAllAsync<{ total: number }>('SELECT COUNT(*) AS total FROM trip_events', []);
    expect([trips[0]?.total, events[0]?.total]).toEqual([0, 0]);
  });
});

describe('RF12 - versão do esquema do banco', () => {
  it('cria as tabelas e marca a versão do esquema', async () => {
    database = createNodeSqliteDatabase();
    await migrate(database);
    const version = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
    const tables = await database.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      [],
    );
    expect(version?.user_version).toBe(SCHEMA_VERSION);
    expect(tables.map((table) => table.name)).toEqual(['trip_events', 'trips']);
  });

  it('rodar a migração duas vezes não apaga nada', async () => {
    database = createNodeSqliteDatabase();
    const storage = await createTripHistoryStorage(database);
    await storage.saveTrip(sampleTrip());
    await migrate(database);
    expect(await storage.loadTrips()).toHaveLength(1);
  });

  it('apagar uma viagem apaga os eventos dela', async () => {
    database = createNodeSqliteDatabase();
    const storage = await createTripHistoryStorage(database);
    await storage.saveTrip(sampleTrip());
    await database.execAsync('DELETE FROM trips;');
    const events = await database.getAllAsync<{ total: number }>('SELECT COUNT(*) AS total FROM trip_events', []);
    expect(events[0]?.total).toBe(0);
  });
});
