import { describe, expect, it } from '@jest/globals';

import { hours, minutes, seconds } from './duration';
import {
  customizeSettings,
  getBreakReminderLimit,
  getDefaultSettings,
  MAX_CHECK_INTERVAL,
  MIN_CHECK_INTERVAL,
  PROFILES,
} from './profiles';
import { VEHICLE_TYPES } from './types';

describe('RF01 - valores padrão dos perfis (Quadro 2)', () => {
  it.each([
    ['truck', hours(5.5), minutes(30), minutes(30), minutes(10), seconds(15)],
    ['bus', hours(4), minutes(30), minutes(30), minutes(10), seconds(10)],
    ['car', hours(2), minutes(15), minutes(15), minutes(15), seconds(15)],
  ] as const)(
    'perfil %s tem lembrete, pausa mínima, pré-aviso, intervalo diurno e etapa do Quadro 2',
    (vehicleType, breakReminder, minimumBreak, preWarning, daytimeInterval, stepDuration) => {
      expect(getDefaultSettings(vehicleType)).toEqual({
        breakReminderAfter: breakReminder,
        minimumBreak,
        breakPreWarningLead: preWarning,
        daytimeCheckInterval: daytimeInterval,
        reducedCheckInterval: minutes(5),
        responseWindow: seconds(15),
        escalationStepDuration: stepDuration,
        preventiveAlertEnabled: true,
      });
    },
  );

  it('perfis caminhão e ônibus têm teto legal de direção, automóvel não', () => {
    expect(PROFILES.truck.legalDrivingCeiling).toBe(hours(5.5));
    expect(PROFILES.bus.legalDrivingCeiling).toBe(hours(4));
    expect(PROFILES.car.legalDrivingCeiling).toBeNull();
  });

  it('devolve uma cópia, sem permitir alterar os padrões', () => {
    const settings = getDefaultSettings('truck');
    settings.breakReminderAfter = hours(10);
    expect(getDefaultSettings('truck').breakReminderAfter).toBe(hours(5.5));
  });
});

describe('RF02 - intervalo de verificação configurável entre 5 e 15 minutos', () => {
  it('define os limites de 5 e 15 minutos', () => {
    expect(MIN_CHECK_INTERVAL).toBe(minutes(5));
    expect(MAX_CHECK_INTERVAL).toBe(minutes(15));
  });

  it.each(VEHICLE_TYPES)('perfil %s aceita os limites exatos de 5 e 15 minutos', (vehicleType) => {
    expect(customizeSettings(vehicleType, { daytimeCheckInterval: minutes(5) })).toMatchObject({
      ok: true,
      settings: { daytimeCheckInterval: minutes(5) },
    });
    expect(customizeSettings(vehicleType, { daytimeCheckInterval: minutes(15) })).toMatchObject({
      ok: true,
      settings: { daytimeCheckInterval: minutes(15) },
    });
  });

  it.each(VEHICLE_TYPES)('perfil %s rejeita intervalo abaixo de 5 minutos', (vehicleType) => {
    expect(customizeSettings(vehicleType, { daytimeCheckInterval: minutes(5) - 1 })).toEqual({
      ok: false,
      errors: ['checkIntervalBelowMinimum'],
    });
  });

  it.each(VEHICLE_TYPES)('perfil %s rejeita intervalo acima de 15 minutos', (vehicleType) => {
    expect(customizeSettings(vehicleType, { daytimeCheckInterval: minutes(15) + 1 })).toEqual({
      ok: false,
      errors: ['checkIntervalAboveMaximum'],
    });
  });

  it('rejeita intervalo que não é um número válido', () => {
    expect(customizeSettings('car', { daytimeCheckInterval: Number.NaN })).toEqual({
      ok: false,
      errors: ['checkIntervalBelowMinimum'],
    });
  });

  it('não altera o intervalo reduzido de 5 minutos', () => {
    const result = customizeSettings('car', { daytimeCheckInterval: minutes(12) });
    expect(result).toMatchObject({ ok: true, settings: { reducedCheckInterval: minutes(5) } });
  });
});

describe('RF02 - lembrete de pausa só pode ser reduzido', () => {
  it.each([
    ['truck', hours(5.5)],
    ['bus', hours(4)],
  ] as const)('perfil %s nunca passa do teto legal', (vehicleType, legalCeiling) => {
    expect(getBreakReminderLimit(vehicleType)).toBe(legalCeiling);
    expect(customizeSettings(vehicleType, { breakReminderAfter: legalCeiling + 1 })).toEqual({
      ok: false,
      errors: ['breakReminderAboveLimit'],
    });
  });

  it('perfil automóvel não passa do padrão de 2 horas', () => {
    expect(getBreakReminderLimit('car')).toBe(hours(2));
    expect(customizeSettings('car', { breakReminderAfter: hours(2) + 1 })).toEqual({
      ok: false,
      errors: ['breakReminderAboveLimit'],
    });
  });

  it.each([
    ['truck', hours(4)],
    ['bus', hours(3)],
    ['car', hours(1.5)],
  ] as const)('perfil %s aceita lembrete reduzido', (vehicleType, reducedReminder) => {
    expect(customizeSettings(vehicleType, { breakReminderAfter: reducedReminder })).toMatchObject({
      ok: true,
      settings: { breakReminderAfter: reducedReminder },
    });
  });

  it('rejeita lembrete que não fica depois do pré-aviso', () => {
    expect(customizeSettings('truck', { breakReminderAfter: minutes(30) })).toEqual({
      ok: false,
      errors: ['breakReminderNotAfterPreWarning'],
    });
    expect(customizeSettings('car', { breakReminderAfter: Number.NaN })).toEqual({
      ok: false,
      errors: ['breakReminderNotAfterPreWarning'],
    });
  });
});

describe('RF02 - personalização do perfil', () => {
  it('sem alterações, devolve os valores padrão', () => {
    expect(customizeSettings('bus', {})).toEqual({ ok: true, settings: getDefaultSettings('bus') });
  });

  it('ignora alterações sem valor', () => {
    expect(
      customizeSettings('bus', { daytimeCheckInterval: undefined, breakReminderAfter: undefined }),
    ).toEqual({ ok: true, settings: getDefaultSettings('bus') });
  });

  it('informa todos os erros de uma vez', () => {
    expect(
      customizeSettings('truck', { daytimeCheckInterval: minutes(20), breakReminderAfter: hours(6) }),
    ).toEqual({ ok: false, errors: ['checkIntervalAboveMaximum', 'breakReminderAboveLimit'] });
  });

  it('mantém os demais parâmetros do perfil', () => {
    const result = customizeSettings('bus', { daytimeCheckInterval: minutes(8) });
    expect(result).toEqual({
      ok: true,
      settings: { ...getDefaultSettings('bus'), daytimeCheckInterval: minutes(8) },
    });
  });
});
