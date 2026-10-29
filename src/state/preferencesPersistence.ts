import type { PreferencesStorage } from '../services/preferences/preferencesStorage';
import type { PreferencesStore } from './preferences';

export interface PreferencesPersistence {
  ready: Promise<void>;
  stop(): void;
}

export function persistPreferences(
  store: PreferencesStore,
  openStorage: () => Promise<PreferencesStorage>,
): PreferencesPersistence {
  const initial = store.getSnapshot();
  let stopped = false;
  let unsubscribe: () => void = () => undefined;

  async function connect(): Promise<void> {
    const storage = await openStorage();
    const stored = await storage.load();
    if (stopped) {
      return;
    }
    if (store.getSnapshot() !== initial) {
      await storage.save(store.getSnapshot());
    } else if (stored !== null) {
      store.restore(stored);
    }
    if (stopped) {
      return;
    }
    let saving: Promise<void> = Promise.resolve();
    unsubscribe = store.subscribe(() => {
      const preferences = store.getSnapshot();
      saving = saving.then(() => storage.save(preferences)).catch(() => undefined);
    });
  }

  return {
    ready: connect().catch(() => undefined),
    stop() {
      stopped = true;
      unsubscribe();
    },
  };
}
