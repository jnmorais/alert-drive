import { describe, expect, it } from '@jest/globals';

import {
  type AlertChannelState,
  canDisableChannel,
  canSilence,
  createTripAlertChannels,
  effectiveChannels,
  setChannelEnabled,
  toggleSilence,
} from './alertChannels';

const allOn = createTripAlertChannels();

function state(overrides: Partial<AlertChannelState>): AlertChannelState {
  return { ...allOn, ...overrides };
}

function unwrap(result: ReturnType<typeof setChannelEnabled>): AlertChannelState {
  if (!result.ok) {
    throw new Error(`Mudança recusada: ${result.error}`);
  }
  return result.state;
}

describe('RF09 - canal visual sempre ativo', () => {
  it.each([
    state({}),
    state({ soundEnabled: false }),
    state({ vibrationEnabled: false }),
    state({ silenced: true }),
  ])('o canal visual está ativo na combinação %o', (channelState) => {
    expect(effectiveChannels(channelState).visual).toBe(true);
  });
});

describe('RF09 - som e vibração independentes', () => {
  it('começa com todos os canais ativos', () => {
    expect(effectiveChannels(allOn)).toEqual({ visual: true, sound: true, vibration: true });
  });

  it('desliga só o som, mantendo a vibração', () => {
    const next = unwrap(setChannelEnabled(allOn, 'sound', false));
    expect(effectiveChannels(next)).toEqual({ visual: true, sound: false, vibration: true });
  });

  it('desliga só a vibração, mantendo o som', () => {
    const next = unwrap(setChannelEnabled(allOn, 'vibration', false));
    expect(effectiveChannels(next)).toEqual({ visual: true, sound: true, vibration: false });
  });

  it('religa um canal desligado', () => {
    const next = unwrap(setChannelEnabled(state({ soundEnabled: false }), 'sound', true));
    expect(effectiveChannels(next).sound).toBe(true);
  });
});

describe('RF09 - proibido manter só o canal visual', () => {
  it('recusa desligar o som com a vibração já desligada', () => {
    expect(setChannelEnabled(state({ vibrationEnabled: false }), 'sound', false)).toEqual({
      ok: false,
      error: 'visualOnlyNotAllowed',
    });
  });

  it('recusa desligar a vibração com o som já desligado', () => {
    expect(setChannelEnabled(state({ soundEnabled: false }), 'vibration', false)).toEqual({
      ok: false,
      error: 'visualOnlyNotAllowed',
    });
  });

  it('recusa desligar a vibração com o som silenciado', () => {
    expect(setChannelEnabled(state({ silenced: true }), 'vibration', false)).toEqual({
      ok: false,
      error: 'visualOnlyNotAllowed',
    });
  });

  it('informa à interface quais canais podem ser desligados', () => {
    expect(canDisableChannel(allOn, 'sound')).toBe(true);
    expect(canDisableChannel(allOn, 'vibration')).toBe(true);
    expect(canDisableChannel(state({ vibrationEnabled: false }), 'sound')).toBe(false);
    expect(canDisableChannel(state({ soundEnabled: false }), 'vibration')).toBe(false);
  });
});

describe('RF10 - silenciar e reativar os alertas', () => {
  it('silenciar desliga o som e mantém visual e vibração', () => {
    const silenced = unwrap(toggleSilence(allOn));
    expect(effectiveChannels(silenced)).toEqual({ visual: true, sound: false, vibration: true });
  });

  it('reativar usa a mesma única ação usada para silenciar', () => {
    const silenced = unwrap(toggleSilence(allOn));
    const reactivated = unwrap(toggleSilence(silenced));
    expect(reactivated).toEqual(allOn);
  });

  it('não permite silenciar com a vibração desligada', () => {
    const noVibration = state({ vibrationEnabled: false });
    expect(toggleSilence(noVibration)).toEqual({ ok: false, error: 'visualOnlyNotAllowed' });
    expect(canSilence(noVibration)).toBe(false);
  });

  it('reativar é sempre permitido', () => {
    expect(canSilence(state({ silenced: true }))).toBe(true);
    expect(toggleSilence(state({ silenced: true }))).toEqual({ ok: true, state: allOn });
  });

  it('silenciar é permitido com a vibração ligada', () => {
    expect(canSilence(allOn)).toBe(true);
  });
});

describe('RF10 - alertas restaurados a cada nova viagem', () => {
  it('uma viagem nova começa com som, vibração e sem silêncio', () => {
    expect(createTripAlertChannels()).toEqual({
      soundEnabled: true,
      vibrationEnabled: true,
      silenced: false,
    });
  });

  it('as escolhas da viagem anterior não passam para a seguinte', () => {
    const previousTrip = unwrap(toggleSilence(unwrap(setChannelEnabled(allOn, 'sound', false))));
    expect(previousTrip).not.toEqual(createTripAlertChannels());
    expect(effectiveChannels(createTripAlertChannels())).toEqual({
      visual: true,
      sound: true,
      vibration: true,
    });
  });
});
