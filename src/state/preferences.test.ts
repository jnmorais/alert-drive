import { describe, expect, it, jest } from '@jest/globals';

import { hours, minutes } from '../core/duration';
import { getDefaultSettings } from '../core/profiles';
import { VEHICLE_TYPES } from '../core/types';
import {
  createDefaultPreferences,
  createPreferencesStore,
  DEFAULT_VEHICLE_TYPE,
  sanitizePreferences,
  settingsFor,
} from './preferences';

describe('RF01 - seleção do perfil de veículo', () => {
  it('começa com o perfil automóvel e sem personalizações', () => {
    const preferences = createDefaultPreferences();
    expect(DEFAULT_VEHICLE_TYPE).toBe('car');
    expect(preferences).toEqual({ vehicleType: 'car', overrides: { truck: {}, bus: {}, car: {} } });
  });

  it.each(VEHICLE_TYPES)('ao escolher %s, carrega os valores padrão do Quadro 2', (vehicleType) => {
    const store = createPreferencesStore();
    store.selectVehicle(vehicleType);
    expect(store.getSnapshot().vehicleType).toBe(vehicleType);
    expect(settingsFor(store.getSnapshot())).toEqual(getDefaultSettings(vehicleType));
  });

  it('avisa os assinantes quando o perfil muda e permite cancelar a assinatura', () => {
    const store = createPreferencesStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    store.selectVehicle('truck');
    expect(listener).toHaveBeenCalledTimes(1);
    store.selectVehicle('truck');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.selectVehicle('bus');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('RF02 - personalização guardada por perfil', () => {
  it('guarda uma personalização válida só para o perfil indicado', () => {
    const store = createPreferencesStore();
    expect(store.setOverrides('truck', { daytimeCheckInterval: minutes(8) })).toEqual({ ok: true });
    const snapshot = store.getSnapshot();
    expect(settingsFor(snapshot, 'truck').daytimeCheckInterval).toBe(minutes(8));
    expect(settingsFor(snapshot, 'bus')).toEqual(getDefaultSettings('bus'));
  });

  it('recusa uma personalização inválida e mantém a anterior', () => {
    const store = createPreferencesStore();
    store.setOverrides('bus', { breakReminderAfter: hours(3) });
    expect(store.setOverrides('bus', { breakReminderAfter: hours(5) })).toEqual({
      ok: false,
      errors: ['breakReminderAboveLimit'],
    });
    expect(settingsFor(store.getSnapshot(), 'bus').breakReminderAfter).toBe(hours(3));
  });

  it('volta o perfil aos valores padrão', () => {
    const store = createPreferencesStore();
    store.setOverrides('car', { daytimeCheckInterval: minutes(6) });
    store.resetOverrides('car');
    expect(settingsFor(store.getSnapshot(), 'car')).toEqual(getDefaultSettings('car'));
  });

  it('acusa uma personalização inválida recebida de fora do armazenamento', () => {
    const invalid = { vehicleType: 'car' as const, overrides: { truck: {}, bus: {}, car: { daytimeCheckInterval: minutes(1) } } };
    expect(() => settingsFor(invalid)).toThrow('Personalização inválida guardada para car');
  });
});

describe('RF01 e RF02 - preferências gravadas validadas ao abrir o app', () => {
  it('mantém o perfil e as personalizações válidas', () => {
    expect(
      sanitizePreferences({ vehicleType: 'truck', overrides: { truck: { daytimeCheckInterval: minutes(7) } } }),
    ).toEqual({ vehicleType: 'truck', overrides: { truck: { daytimeCheckInterval: minutes(7) }, bus: {}, car: {} } });
  });

  it('volta ao perfil padrão se o perfil gravado for desconhecido', () => {
    expect(sanitizePreferences({ vehicleType: 'moto', overrides: {} }).vehicleType).toBe(DEFAULT_VEHICLE_TYPE);
  });

  it('descarta a personalização que deixou de ser válida, sem mexer nas outras', () => {
    const preferences = sanitizePreferences({
      vehicleType: 'bus',
      overrides: {
        bus: { breakReminderAfter: hours(6) },
        car: { daytimeCheckInterval: minutes(12) },
        moto: { daytimeCheckInterval: minutes(5) },
      },
    });
    expect(preferences.overrides).toEqual({ truck: {}, bus: {}, car: { daytimeCheckInterval: minutes(12) } });
  });

  it('restaurar troca as preferências e avisa a tela', () => {
    const store = createPreferencesStore();
    const listener = jest.fn();
    store.subscribe(listener);
    store.restore({ vehicleType: 'truck', overrides: { truck: { breakReminderAfter: hours(4) }, bus: {}, car: {} } });
    expect(store.getSnapshot().vehicleType).toBe('truck');
    expect(settingsFor(store.getSnapshot()).breakReminderAfter).toBe(hours(4));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
