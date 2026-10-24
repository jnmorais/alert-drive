import type { CheckIntervalSelection } from '../core/checkScheduler';
import { minutes } from '../core/duration';
import type { TripStatus } from '../core/tripStatus';
import type { Milliseconds } from '../core/types';
import { formatDuration } from '../simulation/format';
import { REDUCED_INTERVAL_REASON_LABELS } from './labels';

export interface BreakMessage {
  text: string;
  emphasis: boolean;
}

export const STOP_RECOMMENDATION =
  'Pare assim que for seguro. Verificações a cada 5 min até a próxima pausa.';

function formatWholeMinutes(wholeMinutes: number): string {
  return wholeMinutes === 0 ? '0 min' : formatDuration(minutes(wholeMinutes));
}

export function formatElapsed(duration: Milliseconds): string {
  return formatWholeMinutes(Math.floor(duration / minutes(1)));
}

export function formatRemaining(duration: Milliseconds): string {
  return formatWholeMinutes(Math.ceil(duration / minutes(1)));
}

export function movementLabel(status: TripStatus): string {
  if (!status.hasSpeedData) {
    return 'Aguardando a velocidade do GPS';
  }
  return status.movement === 'moving' ? 'Em movimento' : 'Parado';
}

export function breakMessage(status: TripStatus, minimumBreak: Milliseconds): BreakMessage {
  if (status.breakPhase === 'overdue') {
    return { text: `Pausa vencida. Pare e descanse ${formatRemaining(minimumBreak)}.`, emphasis: true };
  }
  const text = `Pausa em ${formatRemaining(status.timeUntilBreakReminder)}`;
  return status.breakPhase === 'preWarning'
    ? { text: `${text}. Planeje uma parada.`, emphasis: true }
    : { text, emphasis: false };
}

export function stopMessage(status: TripStatus): string | null {
  if (status.stoppedFor === null || status.breakRemaining === null) {
    return null;
  }
  if (status.breakRemaining === 0) {
    return 'Pausa registrada. Tempo de direção zerado.';
  }
  return `Parado há ${formatElapsed(status.stoppedFor)}. Faltam ${formatRemaining(status.breakRemaining)} para contar como pausa.`;
}

export function checkMessage(status: TripStatus): string {
  if (status.checkPhase === 'active') {
    return 'Em andamento';
  }
  if (status.timeUntilNextCheck === null) {
    return 'Só com o veículo em movimento';
  }
  return `Próxima em ${formatRemaining(status.timeUntilNextCheck)}`;
}

export function intervalMessage(selection: CheckIntervalSelection): string {
  const base = `A cada ${formatRemaining(selection.interval)}`;
  if (selection.reasons.length === 0) {
    return base;
  }
  const reasons = selection.reasons.map((reason) => REDUCED_INTERVAL_REASON_LABELS[reason].toLowerCase());
  return `${base} (${reasons.join(', ')})`;
}
