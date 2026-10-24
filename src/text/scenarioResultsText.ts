import type { VehicleType } from '../core/types';
import type { ScenarioReport } from '../simulation/report';
import { VEHICLE_TYPE_LABELS } from './labels';

export interface ProfileResult {
  vehicleType: VehicleType;
  label: string;
  approved: boolean;
  failures: string[];
}

export interface ScenarioResultGroup {
  scenarioId: string;
  title: string;
  results: ProfileResult[];
}

export const AUTOMATIC_SCENARIOS_NOTE =
  'Roda todos os cenários nos três perfis, com os valores padrão de cada perfil e as respostas do roteiro, e confere o resultado esperado de cada um.';

export const RUNNING_SCENARIOS_LABEL = 'Rodando os cenários…';

export function runScenariosLabel(scenarioCount: number, profileCount: number): string {
  return `Rodar os ${scenarioCount} cenários nos ${profileCount} perfis`;
}

export function approvalLabel(approved: boolean): string {
  return approved ? 'Aprovado' : 'Reprovado';
}

export function overallResultText(reports: readonly ScenarioReport[]): string {
  const approved = reports.filter((report) => report.approved).length;
  return `${approved} de ${reports.length} execuções aprovadas`;
}

function failureLines(report: ScenarioReport): string[] {
  return report.expectations
    .filter((expectation) => !expectation.passed)
    .map((expectation) => `${expectation.description}: esperado ${expectation.expected}, obtido ${expectation.actual}`);
}

export function groupReports(reports: readonly ScenarioReport[]): ScenarioResultGroup[] {
  const groups: ScenarioResultGroup[] = [];
  for (const report of reports) {
    let group = groups.find((candidate) => candidate.scenarioId === report.scenario.id);
    if (group === undefined) {
      group = { scenarioId: report.scenario.id, title: report.scenario.title, results: [] };
      groups.push(group);
    }
    group.results.push({
      vehicleType: report.run.vehicleType,
      label: VEHICLE_TYPE_LABELS[report.run.vehicleType],
      approved: report.approved,
      failures: failureLines(report),
    });
  }
  return groups;
}
