import { seconds } from '../core/duration';
import type { Milliseconds } from '../core/types';
import { formatDuration } from '../simulation/format';
import type { Scenario } from '../simulation/scenarios';
import type { SimulationProgress, SimulationStatus } from '../state/simulationRunner';
import { formatElapsed } from './tripText';

export const SIMULATION_STATUS_LABELS: Readonly<Record<SimulationStatus, string>> = {
  idle: 'Parada',
  running: 'Em andamento',
  paused: 'Pausada',
  finished: 'Roteiro concluído. Veículo parado.',
};

export const AUTO_RESPONSE_LABEL = 'Respostas';

export const START_TIME_NOTE = 'Entre 00:00 e 06:00, as verificações passam a 5 min.';

export const SIMULATION_TOUCH_NOTE =
  'Na simulação, o botão "Estou bem" aparece mesmo com o veículo em movimento, porque ninguém está dirigindo.';

export function autoResponseValue(enabled: boolean): string {
  return enabled ? 'Do roteiro' : 'Pelo toque';
}

export function speedFactorLabel(speedFactor: number): string {
  if (speedFactor === 1) {
    return 'Tempo real';
  }
  return `${speedFactor}× (1 s = ${formatDuration(seconds(speedFactor))})`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatStartTime(hour: number, minute: number): string {
  return `${twoDigits(hour)}:${twoDigits(minute)}`;
}

export function scenarioOptionLabel(scenario: Scenario): string {
  return `${scenario.id} – ${scenario.title}`;
}

export function scriptLengthNote(duration: Milliseconds, speedFactor: number): string {
  const realDuration = Math.ceil(duration / speedFactor / seconds(1)) * seconds(1);
  return `Duração: ${formatDuration(duration)} simulados, cerca de ${formatDuration(realDuration)} reais.`;
}

export function progressText(progress: SimulationProgress): string {
  return `${formatElapsed(progress.elapsed)} de ${formatElapsed(progress.duration)}`;
}

export function speedText(speedKmh: number | null): string {
  return speedKmh === null ? '–' : `${speedKmh} km/h`;
}
