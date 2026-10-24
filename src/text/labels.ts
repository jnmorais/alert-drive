import type { ReducedIntervalReason } from '../core/checkScheduler';
import type { AlertStage } from '../core/escalation';
import type { VehicleType } from '../core/types';

export const VEHICLE_TYPE_LABELS: Readonly<Record<VehicleType, string>> = {
  truck: 'Caminhão',
  bus: 'Ônibus',
  car: 'Automóvel',
};

export const ALERT_STAGE_LABELS: Readonly<Record<AlertStage, string>> = {
  check: 'Verificação',
  preventive: 'Etapa 1 – Preventiva',
  mandatory: 'Etapa 2 – Obrigatória',
  maximum: 'Etapa 3 – Máxima',
};

export const REDUCED_INTERVAL_REASON_LABELS: Readonly<Record<ReducedIntervalReason, string>> = {
  night: 'Madrugada',
  breakOverdue: 'Pausa vencida',
  recurrentEpisodes: 'Episódios recorrentes',
};
