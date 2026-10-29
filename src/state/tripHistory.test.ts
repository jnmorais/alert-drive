import { describe, expect, it } from '@jest/globals';

import { minutes } from '../core/duration';
import { getDefaultSettings } from '../core/profiles';
import type { Clock } from '../core/types';
import { createTripHistoryStorage, type TripHistoryStorage } from '../services/eventLog/tripHistoryStorage';
import { migrateDatabase } from '../services/database/migrations';
import { createNodeSqliteDatabase } from '../testing/nodeSqliteDatabase';
import { createTripHistoryStore, recordCompletedTrips } from './tripHistory';
import { type CompletedTrip, createTripController, type TimerScheduler } from './tripController';

const START = Date.UTC(2026, 9, 24, 12, 0);

function trip(startedAt: number): CompletedTrip {
  return {
    config: { vehicleType: 'car', settings: getDefaultSettings('car'), utcOffsetMinutes: -180, startedAt },
    simulationMode: true,
    endedAt: startedAt + minutes(30),
    effects: [],
  };
}

function memoryStorage(initial: CompletedTrip[] = []): TripHistoryStorage & { saved: CompletedTrip[] } {
  const saved = [...initial];
  return {
    saved,
    loadTrips: async () => [...saved],
    saveTrip: async (completed) => {
      saved.push(completed);
    },
  };
}

const noTimers: TimerScheduler = { schedule: () => () => undefined };

describe('RF12 - histórico carregado do aparelho ao abrir o app', () => {
  it('começa carregando e depois mostra as viagens gravadas', async () => {
    const store = createTripHistoryStore(async () => memoryStorage([trip(START)]));
    expect(store.getSnapshot()).toEqual({ status: 'loading', trips: [] });
    await store.ready();
    expect(store.getSnapshot()).toEqual({ status: 'saved', trips: [trip(START)] });
  });

  it('grava cada viagem nova e mostra na hora', async () => {
    const storage = memoryStorage();
    const store = createTripHistoryStore(async () => storage);
    await store.ready();
    const saving = store.add(trip(START));
    expect(store.getSnapshot().trips).toEqual([trip(START)]);
    await saving;
    expect(storage.saved).toEqual([trip(START)]);
  });

  it('uma viagem encerrada antes do fim da carga não se perde nem se repete', async () => {
    const storage = memoryStorage([trip(START)]);
    const store = createTripHistoryStore(async () => storage);
    const saving = store.add(trip(START + minutes(60)));
    await saving;
    expect(store.getSnapshot()).toEqual({ status: 'saved', trips: [trip(START), trip(START + minutes(60))] });
    expect(storage.saved).toHaveLength(2);
  });

  it('avisa quem acompanha até cancelar a inscrição', async () => {
    const store = createTripHistoryStore(async () => memoryStorage());
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });
    await store.ready();
    unsubscribe();
    await store.add(trip(START));
    expect(notifications).toBe(1);
  });
});

describe('RF12 - histórico continua na memória se o banco falhar', () => {
  it('se o banco não abre, mostra as viagens só na memória', async () => {
    const store = createTripHistoryStore(async () => {
      throw new Error('sem banco');
    });
    await store.ready();
    await store.add(trip(START));
    expect(store.getSnapshot()).toEqual({ status: 'memoryOnly', trips: [trip(START)] });
  });

  it('se uma gravação falha, mantém a viagem na tela e avisa', async () => {
    const store = createTripHistoryStore(async () => ({
      loadTrips: async () => [],
      saveTrip: async () => {
        throw new Error('disco cheio');
      },
    }));
    await store.ready();
    await store.add(trip(START));
    expect(store.getSnapshot()).toEqual({ status: 'memoryOnly', trips: [trip(START)] });
  });
});

describe('RF12 - cada viagem encerrada vai para o histórico gravado', () => {
  it('grava no banco a viagem encerrada pelo controlador da viagem', async () => {
    let now = START;
    const clock: Clock = { now: () => now };
    const controller = createTripController({ timers: noTimers });
    const database = createNodeSqliteDatabase();
    await migrateDatabase(database);
    const store = createTripHistoryStore(async () => createTripHistoryStorage(database));
    const stop = recordCompletedTrips(controller, store);
    await store.ready();

    controller.start({
      vehicleType: 'truck',
      settings: getDefaultSettings('truck'),
      utcOffsetMinutes: -180,
      clock,
      simulationMode: false,
    });
    controller.pushSpeedSample(80);
    now = START + minutes(20);
    controller.pushSpeedSample(80);
    controller.end();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const reopened = createTripHistoryStorage(database);
    const stored = await reopened.loadTrips();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual(controller.getSnapshot().completedTrips[0]);
    stop();
    database.close();
  });

  it('não regrava viagens que já estavam no controlador ao ligar', () => {
    const controller = createTripController({ timers: noTimers });
    controller.start({
      vehicleType: 'car',
      settings: getDefaultSettings('car'),
      utcOffsetMinutes: -180,
      clock: { now: () => START },
      simulationMode: true,
    });
    controller.end();
    const added: CompletedTrip[] = [];
    const stop = recordCompletedTrips(controller, { add: async (completed) => void added.push(completed) });
    controller.start({
      vehicleType: 'bus',
      settings: getDefaultSettings('bus'),
      utcOffsetMinutes: -180,
      clock: { now: () => START },
      simulationMode: true,
    });
    expect(controller.getSnapshot().trip?.config.vehicleType).toBe('bus');
    expect(added).toEqual([]);
    stop();
  });
});
