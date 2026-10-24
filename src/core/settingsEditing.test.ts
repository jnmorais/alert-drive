import { describe, expect, it } from '@jest/globals';

import { createTripAlertChannels } from './alertChannels';
import { hours, minutes } from './duration';
import { customizeSettings, getDefaultSettings } from './profiles';
import {
  BREAK_REMINDER_STEP,
  breakReminderRange,
  canStepSetting,
  CHECK_INTERVAL_STEP,
  checkIntervalRange,
  differsFromDefaults,
  isChannelToggleAvailable,
  isSettingsEditingAllowed,
  isSilenceToggleAvailable,
  type SettingRange,
  stepSetting,
} from './settingsEditing';
import { VEHICLE_TYPES } from './types';

function reachableValues(range: SettingRange): number[] {
  const values = [range.min];
  while (canStepSetting(values[values.length - 1]!, range, 'increase')) {
    values.push(stepSetting(values[values.length - 1]!, range, 'increase'));
  }
  return values;
}

describe('RF02 - faixa do intervalo de verificação', () => {
  it('vai de 5 a 15 minutos, de 1 em 1 minuto', () => {
    expect(checkIntervalRange()).toEqual({ min: minutes(5), max: minutes(15), step: CHECK_INTERVAL_STEP });
    expect(CHECK_INTERVAL_STEP).toBe(minutes(1));
    expect(reachableValues(checkIntervalRange())).toHaveLength(11);
  });

  it('todos os valores da faixa são aceitos pela regra do RF02 em todos os perfis', () => {
    for (const vehicleType of VEHICLE_TYPES) {
      for (const value of reachableValues(checkIntervalRange())) {
        expect(customizeSettings(vehicleType, { daytimeCheckInterval: value }).ok).toBe(true);
      }
    }
  });
});

describe('RF02 - faixa do lembrete de pausa', () => {
  it('termina no teto legal do caminhão e do ônibus', () => {
    expect(breakReminderRange('truck').max).toBe(hours(5.5));
    expect(breakReminderRange('bus').max).toBe(hours(4));
  });

  it('termina no padrão do automóvel, porque o lembrete só pode ser reduzido', () => {
    expect(breakReminderRange('car').max).toBe(hours(2));
  });

  it('começa um passo depois do pré-aviso', () => {
    expect(BREAK_REMINDER_STEP).toBe(minutes(15));
    expect(breakReminderRange('truck').min).toBe(minutes(45));
    expect(breakReminderRange('bus').min).toBe(minutes(45));
    expect(breakReminderRange('car').min).toBe(minutes(30));
  });

  it('todos os valores da faixa são aceitos pela regra do RF02', () => {
    for (const vehicleType of VEHICLE_TYPES) {
      const values = reachableValues(breakReminderRange(vehicleType));
      expect(values[values.length - 1]).toBe(getDefaultSettings(vehicleType).breakReminderAfter);
      for (const value of values) {
        expect(customizeSettings(vehicleType, { breakReminderAfter: value }).ok).toBe(true);
      }
    }
  });
});

describe('RF02 - ajuste passo a passo', () => {
  const range: SettingRange = { min: minutes(5), max: minutes(15), step: minutes(1) };

  it('aumenta e diminui um passo', () => {
    expect(stepSetting(minutes(10), range, 'increase')).toBe(minutes(11));
    expect(stepSetting(minutes(10), range, 'decrease')).toBe(minutes(9));
  });

  it('não passa dos limites da faixa', () => {
    expect(stepSetting(minutes(15), range, 'increase')).toBe(minutes(15));
    expect(stepSetting(minutes(5), range, 'decrease')).toBe(minutes(5));
  });

  it('informa quando não há mais passo na direção pedida', () => {
    expect(canStepSetting(minutes(15), range, 'increase')).toBe(false);
    expect(canStepSetting(minutes(15), range, 'decrease')).toBe(true);
    expect(canStepSetting(minutes(5), range, 'decrease')).toBe(false);
    expect(canStepSetting(minutes(5), range, 'increase')).toBe(true);
  });

  it('identifica quando os valores diferem do padrão do perfil', () => {
    expect(differsFromDefaults('car', getDefaultSettings('car'))).toBe(false);
    expect(differsFromDefaults('car', { ...getDefaultSettings('car'), daytimeCheckInterval: minutes(10) })).toBe(true);
    expect(differsFromDefaults('truck', { ...getDefaultSettings('truck'), breakReminderAfter: hours(5) })).toBe(true);
  });
});

describe('RF09 - interruptores dos canais de alerta', () => {
  it('libera os dois interruptores com som e vibração ligados', () => {
    const state = createTripAlertChannels();
    expect(isChannelToggleAvailable(state, 'sound')).toBe(true);
    expect(isChannelToggleAvailable(state, 'vibration')).toBe(true);
  });

  it('bloqueia desligar o único canal não visual que restou', () => {
    const soundOnly = { soundEnabled: true, vibrationEnabled: false, silenced: false };
    expect(isChannelToggleAvailable(soundOnly, 'sound')).toBe(false);
    expect(isChannelToggleAvailable(soundOnly, 'vibration')).toBe(true);
  });

  it('bloqueia desligar a vibração com o som silenciado', () => {
    const silenced = { soundEnabled: true, vibrationEnabled: true, silenced: true };
    expect(isChannelToggleAvailable(silenced, 'vibration')).toBe(false);
    expect(isChannelToggleAvailable(silenced, 'sound')).toBe(true);
  });
});

describe('RF10 - botão de silenciar', () => {
  it('fica disponível com som e vibração ligados', () => {
    expect(isSilenceToggleAvailable(createTripAlertChannels())).toBe(true);
  });

  it('fica disponível para reativar o som silenciado', () => {
    expect(isSilenceToggleAvailable({ soundEnabled: true, vibrationEnabled: true, silenced: true })).toBe(true);
  });

  it('fica indisponível quando o som já está desligado', () => {
    expect(isSilenceToggleAvailable({ soundEnabled: false, vibrationEnabled: true, silenced: false })).toBe(false);
  });

  it('fica indisponível quando silenciar deixaria só o canal visual', () => {
    expect(isSilenceToggleAvailable({ soundEnabled: true, vibrationEnabled: false, silenced: false })).toBe(false);
  });
});

describe('RNF08 - configurações bloqueadas com o veículo em movimento', () => {
  it('libera sem viagem em andamento', () => {
    expect(isSettingsEditingAllowed(null)).toBe(true);
  });

  it('libera com o veículo parado', () => {
    expect(isSettingsEditingAllowed({ movement: 'stopped', simulationMode: false })).toBe(true);
  });

  it('bloqueia com o veículo em movimento', () => {
    expect(isSettingsEditingAllowed({ movement: 'moving', simulationMode: false })).toBe(false);
  });

  it('libera no modo simulação mesmo em movimento', () => {
    expect(isSettingsEditingAllowed({ movement: 'moving', simulationMode: true })).toBe(true);
  });
});
