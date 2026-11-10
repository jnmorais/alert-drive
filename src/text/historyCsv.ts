import { minutes, seconds } from '../core/duration';
import { STAGE_BEHAVIOR } from '../core/escalation';
import { buildTripLog } from '../core/tripLog';
import type { EpochMilliseconds } from '../core/types';
import { CSV_LINE_BREAK, CSV_SEPARATOR, escapeCsvField, formatDecimal, NO_RESPONSE_LABEL } from '../simulation/report';
import type { HistoryExportResult } from '../state/historyExport';
import type { CompletedTrip } from '../state/tripController';
import { formatLocalDateTime } from './historyText';
import { ALERT_STAGE_LABELS, REDUCED_INTERVAL_REASON_LABELS, VEHICLE_TYPE_LABELS } from './labels';

export const UTF8_BYTE_ORDER_MARK = '﻿';

export const HISTORY_CSV_HEADER = [
  'viagem',
  'perfil',
  'modo',
  'evento',
  'data_hora',
  'intervalo_min',
  'motivos_reducao',
  'tempo_ate_resposta_s',
  'etapa_maxima',
  'nivel_simulado',
  'parada_desde',
] as const;

type HistoryCsvColumn = (typeof HISTORY_CSV_HEADER)[number];

type HistoryCsvFields = Partial<Record<HistoryCsvColumn, string>>;

interface TimedFields {
  at: EpochMilliseconds;
  fields: HistoryCsvFields;
}

export interface HistoryCsvFile {
  fileName: string;
  content: string;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatLocalDateTimeWithSeconds(at: EpochMilliseconds, utcOffsetMinutes: number): string {
  return `${formatLocalDateTime(at, utcOffsetMinutes)}:${twoDigits(new Date(at).getUTCSeconds())}`;
}

function tripEventFields(trip: CompletedTrip): TimedFields[] {
  const log = buildTripLog(trip.effects);
  const offset = trip.config.utcOffsetMinutes;
  const checks = log.checks.map((check) => ({
    at: check.startedAt,
    fields: {
      evento: 'verificacao',
      intervalo_min: formatDecimal(check.interval / minutes(1)),
      motivos_reducao: check.reasons.map((reason) => REDUCED_INTERVAL_REASON_LABELS[reason]).join(', '),
      tempo_ate_resposta_s: check.responseTime === null ? NO_RESPONSE_LABEL : formatDecimal(check.responseTime / seconds(1)),
      etapa_maxima: ALERT_STAGE_LABELS[check.maxStage],
      nivel_simulado: String(STAGE_BEHAVIOR[check.maxStage].simulatedLevel),
    },
  }));
  const breaks = log.breaks.map((entry) => ({
    at: entry.registeredAt,
    fields: { evento: 'pausa_registrada', parada_desde: formatLocalDateTimeWithSeconds(entry.stoppedSince, offset) },
  }));
  const marks = (event: string, times: EpochMilliseconds[]) => times.map((at) => ({ at, fields: { evento: event } }));
  return [
    ...checks,
    ...marks('pre_aviso_pausa', log.breakPreWarnings),
    ...marks('lembrete_pausa', log.breakReminders),
    ...breaks,
    ...marks('recomendacao_parada', log.stopRecommendations),
  ].sort((first, second) => first.at - second.at);
}

function tripRows(trip: CompletedTrip, tripNumber: number): string[][] {
  const common: HistoryCsvFields = {
    viagem: String(tripNumber),
    perfil: VEHICLE_TYPE_LABELS[trip.config.vehicleType],
    modo: trip.simulationMode ? 'simulação' : 'real',
  };
  const timed: TimedFields[] = [
    { at: trip.config.startedAt, fields: { evento: 'inicio_viagem' } },
    ...tripEventFields(trip),
    { at: trip.endedAt, fields: { evento: 'fim_viagem' } },
  ];
  return timed.map(({ at, fields }) => {
    const row: HistoryCsvFields = {
      ...common,
      ...fields,
      data_hora: formatLocalDateTimeWithSeconds(at, trip.config.utcOffsetMinutes),
    };
    return HISTORY_CSV_HEADER.map((column) => row[column] ?? '');
  });
}

function csvLine(fields: readonly string[]): string {
  return fields.map(escapeCsvField).join(CSV_SEPARATOR);
}

export function buildHistoryCsv(trips: readonly CompletedTrip[]): string {
  const rows = trips.flatMap((trip, index) => tripRows(trip, index + 1));
  return [HISTORY_CSV_HEADER, ...rows].map(csvLine).join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
}

export function historyExportFileName(at: EpochMilliseconds, utcOffsetMinutes: number): string {
  const local = new Date(at + minutes(utcOffsetMinutes));
  const date = `${local.getUTCFullYear()}-${twoDigits(local.getUTCMonth() + 1)}-${twoDigits(local.getUTCDate())}`;
  return `alert-drive-historico-${date}-${twoDigits(local.getUTCHours())}${twoDigits(local.getUTCMinutes())}.csv`;
}

export function buildHistoryCsvFile(
  trips: readonly CompletedTrip[],
  at: EpochMilliseconds,
  utcOffsetMinutes: number,
): HistoryCsvFile {
  return {
    fileName: historyExportFileName(at, utcOffsetMinutes),
    content: UTF8_BYTE_ORDER_MARK + buildHistoryCsv(trips),
  };
}

export const EXPORT_BUTTON_LABEL = 'Exportar histórico (CSV)';

export const EXPORTING_LABEL = 'Exportando…';

export const EXPORT_PRIVACY_NOTE = 'O arquivo só sai do aparelho se você escolher para onde enviá-lo.';

export const EXPORT_RESULT_NOTES: Readonly<Record<HistoryExportResult, string>> = {
  shared: 'Arquivo CSV do histórico gerado.',
  empty: 'Não há viagens encerradas para exportar.',
  failed: 'Não foi possível exportar o histórico neste aparelho.',
};
