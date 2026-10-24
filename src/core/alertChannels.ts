export type ConfigurableChannel = 'sound' | 'vibration';

export interface AlertChannelState {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  silenced: boolean;
}

export interface EffectiveChannels {
  visual: true;
  sound: boolean;
  vibration: boolean;
}

export type ChannelChangeError = 'visualOnlyNotAllowed';

export type ChannelChangeResult =
  | { ok: true; state: AlertChannelState }
  | { ok: false; error: ChannelChangeError };

export function createTripAlertChannels(): AlertChannelState {
  return { soundEnabled: true, vibrationEnabled: true, silenced: false };
}

export function effectiveChannels(state: AlertChannelState): EffectiveChannels {
  return {
    visual: true,
    sound: state.soundEnabled && !state.silenced,
    vibration: state.vibrationEnabled,
  };
}

function hasNonVisualChannel(state: AlertChannelState): boolean {
  const channels = effectiveChannels(state);
  return channels.sound || channels.vibration;
}

function validate(candidate: AlertChannelState): ChannelChangeResult {
  return hasNonVisualChannel(candidate)
    ? { ok: true, state: candidate }
    : { ok: false, error: 'visualOnlyNotAllowed' };
}

export function setChannelEnabled(
  state: AlertChannelState,
  channel: ConfigurableChannel,
  enabled: boolean,
): ChannelChangeResult {
  const candidate =
    channel === 'sound' ? { ...state, soundEnabled: enabled } : { ...state, vibrationEnabled: enabled };
  return validate(candidate);
}

export function canDisableChannel(state: AlertChannelState, channel: ConfigurableChannel): boolean {
  return setChannelEnabled(state, channel, false).ok;
}

export function toggleSilence(state: AlertChannelState): ChannelChangeResult {
  return validate({ ...state, silenced: !state.silenced });
}

export function canSilence(state: AlertChannelState): boolean {
  return state.silenced || toggleSilence(state).ok;
}
