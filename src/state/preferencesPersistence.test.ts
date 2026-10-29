import { describe, expect, it } from '@jest/globals';

import { minutes } from '../core/duration';
import { migrateDatabase } from '../services/database/migrations';
import { createPreferencesStorage, type PreferencesStorage } from '../services/preferences/preferencesStorage';
import { createNodeSqliteDatabase } from '../testing/nodeSqliteDatabase';
import { createDefaultPreferences, createPreferencesStore, type Preferences } from './preferences';
import { persistPreferences } from './preferencesPersistence';

const truckPreferences: Preferences = {
  vehicleType: 'truck',
  overrides: { truck: { daytimeCheckInterval: minutes(8) }, bus: {}, car: {} },
};

function memoryStorage(initial: Preferences | null): PreferencesStorage & { saved: Preferences[] } {
  const saved: Preferences[] = [];
  return {
    saved,
    load: async () => saved[saved.length - 1] ?? initial,
    save: async (preferences) => {
      saved.push(preferences);
    },
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('RF01 e RF02 - preferências restauradas ao abrir o app', () => {
  it('restaura o perfil e as personalizações gravados', async () => {
    const store = createPreferencesStore();
    const persistence = persistPreferences(store, async () => memoryStorage(truckPreferences));
    await persistence.ready;
    expect(store.getSnapshot()).toEqual(truckPreferences);
  });

  it('na primeira abertura, sem nada gravado, fica com o padrão e não grava nada', async () => {
    const store = createPreferencesStore();
    const storage = memoryStorage(null);
    await persistPreferences(store, async () => storage).ready;
    expect(store.getSnapshot()).toEqual(createDefaultPreferences());
    expect(storage.saved).toEqual([]);
  });

  it('se a pessoa mudou algo antes da carga terminar, vale a mudança dela', async () => {
    const store = createPreferencesStore();
    const storage = memoryStorage(truckPreferences);
    const persistence = persistPreferences(store, async () => storage);
    store.selectVehicle('bus');
    await persistence.ready;
    expect(store.getSnapshot().vehicleType).toBe('bus');
    expect(storage.saved.map((preferences) => preferences.vehicleType)).toEqual(['bus']);
  });
});

describe('RF01 e RF02 - cada mudança de preferência é gravada', () => {
  it('grava a troca de perfil e a personalização, na ordem', async () => {
    const store = createPreferencesStore();
    const storage = memoryStorage(null);
    await persistPreferences(store, async () => storage).ready;
    store.selectVehicle('truck');
    store.setOverrides('truck', { daytimeCheckInterval: minutes(8) });
    await flush();
    expect(storage.saved).toEqual([
      { vehicleType: 'truck', overrides: { truck: {}, bus: {}, car: {} } },
      truckPreferences,
    ]);
  });

  it('para de gravar quando desligado', async () => {
    const store = createPreferencesStore();
    const storage = memoryStorage(null);
    const persistence = persistPreferences(store, async () => storage);
    await persistence.ready;
    persistence.stop();
    store.selectVehicle('bus');
    await flush();
    expect(storage.saved).toEqual([]);
  });

  it('desligado antes da carga terminar, não restaura nem grava', async () => {
    const store = createPreferencesStore();
    const storage = memoryStorage(truckPreferences);
    const persistence = persistPreferences(store, async () => storage);
    persistence.stop();
    await persistence.ready;
    store.selectVehicle('bus');
    await flush();
    expect(store.getSnapshot().vehicleType).toBe('bus');
    expect(storage.saved).toEqual([]);
  });

  it('desligado enquanto grava a mudança feita durante a carga, não continua acompanhando', async () => {
    const store = createPreferencesStore();
    let persistence: ReturnType<typeof persistPreferences> | null = null;
    const storage: PreferencesStorage & { saved: Preferences[] } = {
      saved: [],
      load: async () => null,
      save: async (preferences) => {
        storage.saved.push(preferences);
        persistence?.stop();
      },
    };
    persistence = persistPreferences(store, async () => storage);
    store.selectVehicle('bus');
    await persistence.ready;
    store.selectVehicle('truck');
    await flush();
    expect(storage.saved.map((preferences) => preferences.vehicleType)).toEqual(['bus']);
  });
});

describe('RF01 e RF02 - preferências continuam funcionando se o banco falhar', () => {
  it('se o banco não abre, as preferências ficam só na memória', async () => {
    const store = createPreferencesStore();
    await persistPreferences(store, async () => {
      throw new Error('sem banco');
    }).ready;
    store.selectVehicle('truck');
    expect(store.getSnapshot().vehicleType).toBe('truck');
  });

  it('uma gravação que falha não impede as seguintes', async () => {
    const store = createPreferencesStore();
    const saved: string[] = [];
    let failNext = true;
    await persistPreferences(store, async () => ({
      load: async () => null,
      save: async (preferences) => {
        if (failNext) {
          failNext = false;
          throw new Error('disco cheio');
        }
        saved.push(preferences.vehicleType);
      },
    })).ready;
    store.selectVehicle('truck');
    store.selectVehicle('bus');
    await flush();
    expect(saved).toEqual(['bus']);
  });
});

describe('RF01 e RF02 - preferências sobrevivem a fechar e abrir o app', () => {
  it('o perfil escolhido numa sessão volta na sessão seguinte, pelo banco SQLite', async () => {
    const database = createNodeSqliteDatabase();
    await migrateDatabase(database);
    const openStorage = async () => createPreferencesStorage(database);

    const firstSession = createPreferencesStore();
    const first = persistPreferences(firstSession, openStorage);
    await first.ready;
    firstSession.selectVehicle('truck');
    firstSession.setOverrides('truck', { daytimeCheckInterval: minutes(8) });
    await flush();
    first.stop();

    const secondSession = createPreferencesStore();
    await persistPreferences(secondSession, openStorage).ready;
    expect(secondSession.getSnapshot()).toEqual(truckPreferences);
    database.close();
  });
});
