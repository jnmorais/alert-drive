import { minutes, seconds } from '../core/duration';
import { type EmissionDelaySummary, RNF05_DELAY_TARGET, summarizeEmissionDelays } from '../core/emissionDelay';
import { averageResponseTime, type CheckLogEntry, highestStageInLog, type TripLog } from '../core/tripLog';
import type { EpochMilliseconds, Milliseconds } from '../core/types';
import { formatDuration } from '../simulation/format';
import type { CompletedTrip } from '../state/tripController';
import type { TripHistoryStatus } from '../state/tripHistory';
import { ALERT_STAGE_LABELS, REDUCED_INTERVAL_REASON_LABELS, VEHICLE_TYPE_LABELS } from './labels';
import { formatElapsed } from './tripText';

const TENTH_OF_SECOND = seconds(0.1);

function roundToTenthOfSecond(duration: Milliseconds): Milliseconds {
  return Math.round(duration / TENTH_OF_SECOND) * TENTH_OF_SECOND;
}

export const EMPTY_HISTORY = 'Nenhuma viagem encerrada ainda.';

export const HISTORY_STATUS_NOTES: Readonly<Record<TripHistoryStatus, string>> = {
  loading: 'Carregando o histórico…',
  saved: 'O histórico fica gravado só neste aparelho.',
  memoryOnly: 'Não foi possível gravar o histórico neste aparelho. Ele vale só enquanto o app estiver aberto.',
};

export const TRIP_IN_PROGRESS_NOTE = 'Há uma viagem em andamento. Ela aparece aqui quando for encerrada.';

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function localDate(at: EpochMilliseconds, utcOffsetMinutes: number): Date {
  return new Date(at + minutes(utcOffsetMinutes));
}

export function formatLocalTime(at: EpochMilliseconds, utcOffsetMinutes: number): string {
  const local = localDate(at, utcOffsetMinutes);
  return `${twoDigits(local.getUTCHours())}:${twoDigits(local.getUTCMinutes())}`;
}

export function formatLocalDateTime(at: EpochMilliseconds, utcOffsetMinutes: number): string {
  const local = localDate(at, utcOffsetMinutes);
  const date = `${twoDigits(local.getUTCDate())}/${twoDigits(local.getUTCMonth() + 1)}/${local.getUTCFullYear()}`;
  return `${date} ${formatLocalTime(at, utcOffsetMinutes)}`;
}

export function tripTitle(trip: CompletedTrip): string {
  const { vehicleType, startedAt, utcOffsetMinutes } = trip.config;
  const mode = trip.simulationMode ? ' · Simulação' : '';
  return `${VEHICLE_TYPE_LABELS[vehicleType]} · ${formatLocalDateTime(startedAt, utcOffsetMinutes)}${mode}`;
}

export function tripSummaryLines(trip: CompletedTrip, log: TripLog): string[] {
  const highest = highestStageInLog(log);
  const average = averageResponseTime(log);
  const lines = [
    `Duração: ${formatElapsed(trip.endedAt - trip.config.startedAt)}`,
    `Verificações: ${log.checks.length}`,
    `Tempo médio de resposta: ${average === null ? 'sem respostas' : formatDuration(roundToTenthOfSecond(average))}`,
    `Etapa máxima: ${highest === null ? 'nenhuma' : ALERT_STAGE_LABELS[highest]}`,
    `Pausas registradas: ${log.breaks.length}`,
  ];
  if (log.stopRecommendations.length > 0) {
    lines.push(`Recomendações de parada: ${log.stopRecommendations.length}`);
  }
  const delays = summarizeEmissionDelays(trip.effects);
  if (delays !== null) {
    lines.push(emissionDelayLine(delays));
  }
  return lines;
}

export function formatEmissionDelay(delay: Milliseconds): string {
  return delay < RNF05_DELAY_TARGET ? `${Math.round(delay)} ms` : formatDuration(roundToTenthOfSecond(delay));
}

export function emissionDelayLine(summary: EmissionDelaySummary): string {
  const overTarget = summary.overTarget === 0 ? '' : ` · ${summary.overTarget} acima da meta`;
  return `Atraso dos alertas: máx. ${formatEmissionDelay(summary.maximum)} (meta: menos de 1 s)${overTarget}`;
}

export function checkLine(check: CheckLogEntry, utcOffsetMinutes: number): string {
  const response = check.responseTime === null ? 'sem resposta' : `resposta em ${formatDuration(check.responseTime)}`;
  const reasons =
    check.reasons.length === 0 ? '' : ` (${check.reasons.map((reason) => REDUCED_INTERVAL_REASON_LABELS[reason].toLowerCase()).join(', ')})`;
  return `${formatLocalTime(check.startedAt, utcOffsetMinutes)} · ${response} · ${ALERT_STAGE_LABELS[check.maxStage]}${reasons}`;
}
