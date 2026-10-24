import { hours, minutes, seconds } from '../core/duration';
import { type AlertStage, STAGE_BEHAVIOR, STAGE_ORDER } from '../core/escalation';
import { type EpochMilliseconds, type Milliseconds, VEHICLE_TYPES, type VehicleType } from '../core/types';
import { ALERT_STAGE_LABELS, REDUCED_INTERVAL_REASON_LABELS, VEHICLE_TYPE_LABELS } from '../text/labels';
import { formatDuration } from './format';
import {
  type CheckRecord,
  type Expectation,
  type RunScenarioOptions,
  runScenario,
  type Scenario,
  type ScenarioRun,
  SCENARIOS,
  SIMULATION_UTC_OFFSET_MINUTES,
} from './scenarios';

export const CSV_SEPARATOR = ';';
export const CSV_LINE_BREAK = '\r\n';
export const NO_RESPONSE_LABEL = 'sem resposta';

const CSV_HEADER = [
  'cenario',
  'perfil',
  'verificacao',
  'horario_simulado',
  'tempo_de_viagem',
  'intervalo_min',
  'motivos_reducao',
  'tempo_ate_resposta_s',
  'etapa_maxima',
  'nivel_simulado',
];

export interface ScenarioReport {
  scenario: Scenario;
  run: ScenarioRun;
  expectations: Expectation[];
  approved: boolean;
}

export interface ReportSummary {
  checks: number;
  escalatedChecks: number;
  unansweredChecks: number;
  answeredResponseTimes: Milliseconds[];
  highestStage: AlertStage | null;
  breaksRegistered: number;
  breakPreWarnings: number;
  breakReminders: number;
  stopRecommendations: number;
}

export function createScenarioReport(
  scenario: Scenario,
  vehicleType: VehicleType,
  options: RunScenarioOptions = {},
): ScenarioReport {
  const run = runScenario(scenario, vehicleType, options);
  const expectations = scenario.verify(run);
  return { scenario, run, expectations, approved: expectations.every((expectation) => expectation.passed) };
}

export function createAllScenarioReports(options: RunScenarioOptions = {}): ScenarioReport[] {
  return SCENARIOS.flatMap((scenario) =>
    VEHICLE_TYPES.map((vehicleType) => createScenarioReport(scenario, vehicleType, options)),
  );
}

export function formatLocalClock(at: EpochMilliseconds, utcOffsetMinutes: number): string {
  const day = hours(24);
  const timeOfDay = (((at + minutes(utcOffsetMinutes)) % day) + day) % day;
  const parts = [
    Math.floor(timeOfDay / hours(1)),
    Math.floor((timeOfDay % hours(1)) / minutes(1)),
    Math.floor((timeOfDay % minutes(1)) / seconds(1)),
  ];
  return parts.map((part) => String(part).padStart(2, '0')).join(':');
}

export function formatUtcOffset(utcOffsetMinutes: number): string {
  const sign = utcOffsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(utcOffsetMinutes);
  const wholeHours = Math.floor(absolute / 60);
  const remainingMinutes = absolute % 60;
  return `UTC${sign}${wholeHours}${remainingMinutes === 0 ? '' : `:${String(remainingMinutes).padStart(2, '0')}`}`;
}

export function formatDecimal(value: number): string {
  return String(Math.round(value * 1000) / 1000).replace('.', ',');
}

function highestStageOf(check: CheckRecord): AlertStage {
  return check.stages[check.stages.length - 1]?.stage ?? 'check';
}

function maxStage(stages: AlertStage[]): AlertStage | null {
  if (stages.length === 0) {
    return null;
  }
  return stages.reduce((highest, stage) =>
    STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf(highest) ? stage : highest,
  );
}

export function escapeCsvField(value: string): string {
  if (/[;"\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvLine(fields: string[]): string {
  return fields.map(escapeCsvField).join(CSV_SEPARATOR);
}

export function buildCheckRows(report: ScenarioReport): string[][] {
  const { run } = report;
  return run.checks.map((check) => {
    const stage = highestStageOf(check);
    return [
      run.scenarioId,
      VEHICLE_TYPE_LABELS[run.vehicleType],
      String(check.index + 1),
      formatLocalClock(check.startedAt, SIMULATION_UTC_OFFSET_MINUTES),
      formatDuration(check.startedAt - run.startedAt),
      formatDecimal(check.interval / minutes(1)),
      check.reasons.map((reason) => REDUCED_INTERVAL_REASON_LABELS[reason]).join(', '),
      check.outcome === null ? NO_RESPONSE_LABEL : formatDecimal(check.outcome.responseTime / seconds(1)),
      ALERT_STAGE_LABELS[stage],
      String(STAGE_BEHAVIOR[stage].simulatedLevel),
    ];
  });
}

export function buildCsv(reports: ScenarioReport[]): string {
  const lines = [csvLine(CSV_HEADER), ...reports.flatMap((report) => buildCheckRows(report).map(csvLine))];
  return lines.join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
}

export function summarize(run: ScenarioRun): ReportSummary {
  const count = (type: string) => run.effects.filter((effect) => effect.type === type).length;
  return {
    checks: run.checks.length,
    escalatedChecks: run.checks.filter((check) => check.stages.length > 0).length,
    unansweredChecks: run.checks.filter((check) => check.outcome === null).length,
    answeredResponseTimes: run.checks.flatMap((check) => (check.outcome ? [check.outcome.responseTime] : [])),
    highestStage: maxStage(run.checks.map(highestStageOf)),
    breaksRegistered: count('breakRegistered'),
    breakPreWarnings: count('breakPreWarning'),
    breakReminders: count('breakReminder'),
    stopRecommendations: count('stopRecommended'),
  };
}

function describeResponseTimes(times: Milliseconds[]): string {
  if (times.length === 0) {
    return 'nenhuma verificação respondida';
  }
  const average = times.reduce((total, time) => total + time, 0) / times.length;
  const longest = Math.max(...times);
  return `média ${formatDuration(average)}, máximo ${formatDuration(longest)} (${times.length} respondidas)`;
}

function verdictLabel(approved: boolean): string {
  return approved ? 'APROVADO' : 'REPROVADO';
}

export function buildScenarioSummaryText(report: ScenarioReport): string {
  const { scenario, run, expectations } = report;
  const summary = summarize(run);
  const passed = expectations.filter((expectation) => expectation.passed).length;
  const lines = [
    `Cenário ${scenario.id} – ${scenario.title} | Perfil: ${VEHICLE_TYPE_LABELS[run.vehicleType]}`,
    `Resultado esperado: ${scenario.expectedOutcome}`,
    `Início: ${formatLocalClock(run.startedAt, SIMULATION_UTC_OFFSET_MINUTES)} (${formatUtcOffset(SIMULATION_UTC_OFFSET_MINUTES)}) | Duração simulada: ${formatDuration(run.endedAt - run.startedAt)}`,
    `Verificações: ${summary.checks} | Com escalonamento: ${summary.escalatedChecks} | Sem resposta ao fim: ${summary.unansweredChecks}`,
    `Tempo até a resposta: ${describeResponseTimes(summary.answeredResponseTimes)}`,
    `Etapa máxima atingida: ${summary.highestStage === null ? 'nenhuma verificação' : ALERT_STAGE_LABELS[summary.highestStage]}`,
    `Pausas registradas: ${summary.breaksRegistered} | Pré-avisos: ${summary.breakPreWarnings} | Lembretes: ${summary.breakReminders} | Recomendações de parada: ${summary.stopRecommendations}`,
    `Conferência: ${passed} de ${expectations.length} aprovadas – ${verdictLabel(report.approved)}`,
    ...expectations.map(
      (expectation) =>
        `  [${expectation.passed ? 'OK' : 'FALHA'}] ${expectation.description}: esperado ${expectation.expected}, obtido ${expectation.actual}`,
    ),
  ];
  return lines.join('\n');
}

export function buildOverallSummaryText(reports: ScenarioReport[]): string {
  const approved = reports.filter((report) => report.approved).length;
  const lines = [
    'Relatório da simulação – Alert-Drive',
    `Execuções: ${reports.length} | Aprovadas: ${approved} | Reprovadas: ${reports.length - approved}`,
    '',
    ...reports.map(
      (report) =>
        `${report.scenario.id} | ${VEHICLE_TYPE_LABELS[report.run.vehicleType]} | ${report.scenario.title} | ${verdictLabel(report.approved)}`,
    ),
    '',
    ...reports.map(buildScenarioSummaryText).flatMap((text) => [text, '']),
  ];
  return lines.join('\n');
}
