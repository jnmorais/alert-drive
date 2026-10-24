import { createContext, type ReactNode, useContext, useMemo, useSyncExternalStore } from 'react';

import { createPreferencesStore, type Preferences, type PreferencesStore } from './preferences';

const PreferencesContext = createContext<PreferencesStore | null>(null);

interface PreferencesProviderProps {
  children: ReactNode;
  store?: PreferencesStore;
}

export function PreferencesProvider({ children, store }: PreferencesProviderProps) {
  const value = useMemo(() => store ?? createPreferencesStore(), [store]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferencesStore(): PreferencesStore {
  const store = useContext(PreferencesContext);
  if (store === null) {
    throw new Error('usePreferencesStore precisa estar dentro de PreferencesProvider');
  }
  return store;
}

export function usePreferences(): Preferences {
  const store = usePreferencesStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
