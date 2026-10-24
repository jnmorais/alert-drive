import { type AlertChannelState, type ConfigurableChannel, effectiveChannels } from '../core/alertChannels';
import { getBreakReminderLimit, PROFILES } from '../core/profiles';
import { checkIntervalRange } from '../core/settingsEditing';
import type { VehicleType } from '../core/types';
import { formatDuration } from '../simulation/format';

export const CHANNEL_LABELS: Readonly<Record<ConfigurableChannel, string>> = {
  sound: 'Som',
  vibration: 'Vibração',
};

export const VISUAL_CHANNEL_LABEL = 'Tela';
export const VISUAL_CHANNEL_VALUE = 'Sempre ligada';

export const VISUAL_ONLY_EXPLANATION =
  'O alerta não pode ficar só na tela, porque um aviso só visual pode passar despercebido na direção. Deixe o som ou a vibração ligados.';

export const CHANNELS_WITHOUT_TRIP =
  'Toda viagem começa com tela, som e vibração ligados. Durante a viagem, com o veículo parado, você pode mudar os alertas aqui.';

export const SILENCE_NOTE = 'Silenciar desliga só o som. Na próxima viagem, tudo volta ao normal.';

export const SETTINGS_LOCKED_WHILE_MOVING = 'Pare o veículo para mudar as configurações.';

export const SETTINGS_APPLY_NEXT_TRIP = 'As mudanças no perfil valem a partir da próxima viagem.';

const range = checkIntervalRange();

export const CHECK_INTERVAL_NOTE = `Entre ${formatDuration(range.min)} e ${formatDuration(range.max)}. De madrugada ou com a pausa vencida, passa a ${formatDuration(PROFILES.car.defaults.reducedCheckInterval)}.`;

export function breakReminderNote(vehicleType: VehicleType): string {
  const reason = PROFILES[vehicleType].legalDrivingCeiling === null ? 'o padrão do perfil' : 'o limite legal';
  return `Só pode ser reduzido. Máximo: ${formatDuration(getBreakReminderLimit(vehicleType))}, ${reason}.`;
}

export function channelValueLabel(state: AlertChannelState, channel: ConfigurableChannel): string {
  if (channel === 'vibration') {
    return state.vibrationEnabled ? 'Ligada' : 'Desligada';
  }
  if (!state.soundEnabled) {
    return 'Desligado';
  }
  return state.silenced ? 'Silenciado' : 'Ligado';
}

export function channelRestrictionExplanation(state: AlertChannelState): string | null {
  const channels = effectiveChannels(state);
  return channels.sound && channels.vibration ? null : VISUAL_ONLY_EXPLANATION;
}

export function silenceButtonLabel(state: AlertChannelState): string {
  return state.silenced ? 'Reativar o som' : 'Silenciar alertas';
}
