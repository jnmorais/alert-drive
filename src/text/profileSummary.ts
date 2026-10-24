import type { ProfileSettings } from '../core/profiles';
import { formatDuration } from '../simulation/format';

export interface SummaryLine {
  label: string;
  value: string;
}

export function describeProfileSettings(settings: ProfileSettings): SummaryLine[] {
  return [
    { label: 'Lembrete de pausa', value: `após ${formatDuration(settings.breakReminderAfter)} de direção` },
    { label: 'Pausa mínima', value: formatDuration(settings.minimumBreak) },
    {
      label: 'Verificação',
      value: `a cada ${formatDuration(settings.daytimeCheckInterval)} (${formatDuration(settings.reducedCheckInterval)} de madrugada)`,
    },
    { label: 'Etapas do alerta', value: `a cada ${formatDuration(settings.escalationStepDuration)}` },
  ];
}
