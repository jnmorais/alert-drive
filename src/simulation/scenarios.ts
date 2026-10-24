import { minutes, seconds } from '../core/duration';
import type { MovementState } from '../core/driveTimer';
import {
  type AlertStage,
  type EscalationOutcome,
  STAGE_ORDER,
  stageOffset,
} from '../core/escalation';
import { getDefaultSettings, type ProfileSettings } from '../core/profiles';
import type { ReducedIntervalReason } from '../core/checkScheduler';
import {
  processTripSpeedSample,
  respondToCheck,
  startTrip,
  type TripEffect,
  type TripState,
  type TripUpdate,
} from '../core/trip';
import type { EpochMilliseconds, Milliseconds, VehicleType } from '../core/types';
import { ALERT_STAGE_LABELS } from '../text/labels';
import { localTimeOnSameDay } from './clock';
import { formatDuration } from './format';

export const SIMULATION_UTC_OFFSET_MINUTES = -180;
export const SIMULATION_BASE_DATE = Date.UTC(2026, 9, 24, 12, 0, 0);
export const SIMULATION_STEP: Milliseconds = seconds(1);
export const CRUISING_SPEED_KMH = 80;
export const STOPPED_SPEED_KMH = 0;

const QUICK_RESPONSE = seconds(5);
const ONE_STEP_AFTER = seconds(1);

export interface SpeedSegment {
  duration: Milliseconds;
  speedKmh: number;
}

export type Responder = (checkIndex: number) => Milliseconds | null;

export interface ScenarioPlan {
  startLocalHour: number;
  startLocalMinute: number;
  segments: SpeedSegment[];
  responder: Responder;
}

export interface CheckRecord {
  index: number;
  startedAt: EpochMilliseconds;
  interval: Milliseconds;
  reasons: ReducedIntervalReason[];
  stages: { stage: AlertStage; at: EpochMilliseconds }[];
  outcome: EscalationOutcome | null;
}

export interface Checkpoint {
  segmentIndex: number;
  at: EpochMilliseconds;
  accumulatedDriving: Milliseconds;
  breakOverdue: boolean;
  movement: MovementState;
}

export interface Expectation {
  description: string;
  expected: string;
  actual: string;
  passed: boolean;
}

export interface ScenarioRun {
  scenarioId: string;
  vehicleType: VehicleType;
  settings: ProfileSettings;
  startedAt: EpochMilliseconds;
  endedAt: EpochMilliseconds;
  effects: TripEffect[];
  checks: CheckRecord[];
  checkpoints: Checkpoint[];
  finalTrip: TripState;
}

export interface Scenario {
  id: string;
  title: string;
  expectedOutcome: string;
  plan(settings: ProfileSettings): ScenarioPlan;
  verify(run: ScenarioRun): Expectation[];
}

function driving(duration: Milliseconds): SpeedSegment {
  return { duration, speedKmh: CRUISING_SPEED_KMH };
}

function stopped(duration: Milliseconds): SpeedSegment {
  return { duration, speedKmh: STOPPED_SPEED_KMH };
}

function mandatoryStageResponse(settings: ProfileSettings): Milliseconds {
  return stageOffset('mandatory', settings) + ONE_STEP_AFTER;
}

function expectEqual<T>(description: string, expected: T, actual: T, format: (value: T) => string = String): Expectation {
  return {
    description,
    expected: format(expected),
    actual: format(actual),
    passed: JSON.stringify(expected) === JSON.stringify(actual),
  };
}

function expectTrue(description: string, actual: boolean, expected = 'sim'): Expectation {
  return { description, expected, actual: actual ? 'sim' : 'não', passed: actual };
}

function formatStage(stage: AlertStage | undefined): string {
  return stage === undefined ? 'nenhuma' : ALERT_STAGE_LABELS[stage];
}

function formatStages(stages: (AlertStage | undefined)[]): string {
  return stages.map(formatStage).join(', ');
}

function formatOptionalDuration(value: Milliseconds | undefined): string {
  return value === undefined ? 'ausente' : formatDuration(value);
}

function shortStopScenarioLeg(settings: ProfileSettings): Milliseconds {
  const preWarningThreshold = settings.breakReminderAfter - settings.breakPreWarningLead;
  return Math.floor((preWarningThreshold * 0.45) / minutes(1)) * minutes(1);
}

function formatDurations(values: Milliseconds[]): string {
  return values.length === 0 ? 'nenhum' : values.map(formatDuration).join(', ');
}

function ofType<T extends TripEffect['type']>(effects: TripEffect[], type: T) {
  return effects.filter((effect): effect is Extract<TripEffect, { type: T }> => effect.type === type);
}

function escalatedChecks(run: ScenarioRun): CheckRecord[] {
  return run.checks.filter((check) => check.stages.length > 0);
}

function stageOffsets(check: CheckRecord): Milliseconds[] {
  return check.stages.map((stage) => stage.at - check.startedAt);
}

function expectedStageOffsets(settings: ProfileSettings): Milliseconds[] {
  return STAGE_ORDER.slice(1).map((stage) => stageOffset(stage, settings));
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'S1',
    title: 'Motorista responde sempre rápido',
    expectedOutcome: 'Nenhum escalonamento; verificações no intervalo diurno do perfil.',
    plan: () => ({
      startLocalHour: 9,
      startLocalMinute: 0,
      segments: [driving(minutes(61))],
      responder: () => QUICK_RESPONSE,
    }),
    verify: (run) => [
      expectTrue('houve ao menos três verificações', run.checks.length >= 3),
      expectEqual('verificações com escalonamento', 0, escalatedChecks(run).length),
      expectTrue(
        'todas as verificações usaram o intervalo diurno',
        run.checks.every((check) => check.interval === run.settings.daytimeCheckInterval),
      ),
      expectTrue(
        'todas as respostas ficaram dentro da janela (nível simulado 6)',
        run.checks.every((check) => check.outcome?.simulatedLevel === 6),
      ),
    ],
  },
  {
    id: 'S2',
    title: 'Motorista para de responder',
    expectedOutcome: 'Escalonamento completo até a etapa 3, nos tempos do Quadro 1 para o perfil.',
    plan: (settings) => ({
      startLocalHour: 9,
      startLocalMinute: 0,
      segments: [driving(settings.daytimeCheckInterval * 3 + minutes(2))],
      responder: (checkIndex) => (checkIndex < 2 ? QUICK_RESPONSE : null),
    }),
    verify: (run) => {
      const lastCheck = run.checks[run.checks.length - 1];
      return [
        expectEqual('verificações emitidas', 3, run.checks.length),
        expectEqual('verificações escalonadas', 1, escalatedChecks(run).length),
        expectEqual(
          'horários das etapas 1, 2 e 3 após a verificação',
          expectedStageOffsets(run.settings),
          lastCheck ? stageOffsets(lastCheck) : [],
          formatDurations,
        ),
        expectEqual<AlertStage | undefined>(
          'etapa final',
          'maximum',
          lastCheck?.stages[lastCheck.stages.length - 1]?.stage,
          formatStage,
        ),
        expectTrue('alerta continua ativo ao fim, sem resposta', lastCheck?.outcome === null),
      ];
    },
  },
  {
    id: 'S3',
    title: 'Viagem longa sem pausa',
    expectedOutcome: 'Pré-aviso, lembrete de pausa e intervalo reduzido para 5 minutos.',
    plan: (settings) => ({
      startLocalHour: 8,
      startLocalMinute: 0,
      segments: [driving(settings.breakReminderAfter + minutes(31))],
      responder: () => QUICK_RESPONSE,
    }),
    verify: (run) => {
      const reminderAt = run.startedAt + run.settings.breakReminderAfter;
      const afterReminder = run.checks.filter((check) => check.reasons.includes('breakOverdue'));
      const beforeReminder = run.checks.filter((check) => !check.reasons.includes('breakOverdue'));
      return [
        expectEqual(
          'pré-aviso emitido após',
          [run.settings.breakReminderAfter - run.settings.breakPreWarningLead],
          ofType(run.effects, 'breakPreWarning').map((effect) => effect.at - run.startedAt),
          formatDurations,
        ),
        expectEqual(
          'lembrete de pausa emitido após',
          [run.settings.breakReminderAfter],
          ofType(run.effects, 'breakReminder').map((effect) => effect.at - run.startedAt),
          formatDurations,
        ),
        expectTrue(
          'antes do lembrete, verificações no intervalo diurno',
          beforeReminder.length > 0 &&
            beforeReminder.every(
              (check) => check.interval === run.settings.daytimeCheckInterval && check.startedAt < reminderAt,
            ),
        ),
        expectTrue(
          'depois do lembrete, verificações a cada 5 minutos por pausa vencida',
          afterReminder.length >= 3 && afterReminder.every((check) => check.interval === minutes(5)),
        ),
        expectTrue('pausa vencida ao fim da viagem', run.checkpoints[run.checkpoints.length - 1]?.breakOverdue === true),
      ];
    },
  },
  {
    id: 'S4',
    title: 'Pausa válida e pausa curta demais',
    expectedOutcome: 'A parada curta não zera o tempo de direção; a pausa mínima do perfil zera.',
    plan: (settings) => {
      const leg = shortStopScenarioLeg(settings);
      return {
        startLocalHour: 10,
        startLocalMinute: 0,
        segments: [
          driving(leg),
          stopped(settings.minimumBreak - minutes(5)),
          driving(leg),
          stopped(settings.minimumBreak),
          driving(minutes(30)),
        ],
        responder: () => QUICK_RESPONSE,
      };
    },
    verify: (run) => {
      const leg = shortStopScenarioLeg(run.settings);
      const accumulated = run.checkpoints.map((checkpoint) => checkpoint.accumulatedDriving);
      const expectedByCheckpoint: [string, Milliseconds][] = [
        ['tempo de direção após o primeiro trecho', leg],
        ['tempo de direção após a parada curta', leg],
        ['tempo de direção antes da pausa válida', leg * 2],
        ['tempo de direção após a pausa válida', 0],
        ['tempo de direção ao fim da viagem', minutes(30)],
      ];
      return [
        ...expectedByCheckpoint.map(([description, expected], index) =>
          expectEqual<Milliseconds | undefined>(description, expected, accumulated[index], formatOptionalDuration),
        ),
        expectEqual('pausas registradas', 1, ofType(run.effects, 'breakRegistered').length),
        expectEqual('avisos de pausa emitidos', 0, ofType(run.effects, 'breakPreWarning').length),
      ];
    },
  },
  {
    id: 'S5',
    title: 'Viagem de madrugada',
    expectedOutcome: 'Verificações a cada 5 minutos entre 00h e 06h.',
    plan: () => ({
      startLocalHour: 1,
      startLocalMinute: 0,
      segments: [driving(minutes(61))],
      responder: () => QUICK_RESPONSE,
    }),
    verify: (run) => [
      expectTrue('houve ao menos dez verificações', run.checks.length >= 10),
      expectTrue(
        'todas as verificações a cada 5 minutos pelo modo noturno',
        run.checks.every((check) => check.interval === minutes(5) && check.reasons.includes('night')),
      ),
      expectEqual('verificações com escalonamento', 0, escalatedChecks(run).length),
    ],
  },
  {
    id: 'S6',
    title: 'Dois episódios seguidos na etapa 2 ou acima',
    expectedOutcome: 'Recomendação de parada imediata e intervalo de 5 minutos até a próxima pausa.',
    plan: (settings) => ({
      startLocalHour: 14,
      startLocalMinute: 0,
      segments: [
        driving(settings.daytimeCheckInterval * 2 + minutes(17)),
        stopped(settings.minimumBreak),
        driving(settings.daytimeCheckInterval + minutes(2)),
      ],
      responder: (checkIndex) => (checkIndex < 2 ? mandatoryStageResponse(settings) : QUICK_RESPONSE),
    }),
    verify: (run) => {
      const stopRecommendations = ofType(run.effects, 'stopRecommended');
      const breakAt = ofType(run.effects, 'breakRegistered')[0]?.at ?? Number.POSITIVE_INFINITY;
      const reduced = run.checks.filter((check, index) => index >= 2 && check.startedAt < breakAt);
      const afterBreak = run.checks.filter((check) => check.startedAt > breakAt);
      return [
        expectEqual(
          'etapa máxima dos dois primeiros episódios',
          ['mandatory', 'mandatory'],
          run.checks.slice(0, 2).map((check) => check.outcome?.maxStage),
          formatStages,
        ),
        expectEqual('recomendações de parada imediata', 1, stopRecommendations.length),
        expectEqual(
          'recomendação emitida na resposta ao segundo episódio',
          run.checks[1]?.outcome?.respondedAt,
          stopRecommendations[0]?.at,
          (value) => (value === undefined ? 'nenhuma' : formatDuration(value - run.startedAt)),
        ),
        expectTrue(
          'até a pausa, verificações a cada 5 minutos por episódios recorrentes',
          reduced.length >= 2 &&
            reduced.every((check) => check.interval === minutes(5) && check.reasons.includes('recurrentEpisodes')),
        ),
        expectTrue(
          'depois da pausa, intervalo diurno sem redução',
          afterBreak.length >= 1 &&
            afterBreak.every((check) => check.interval === run.settings.daytimeCheckInterval && check.reasons.length === 0),
        ),
      ];
    },
  },
];

interface TimedSample {
  at: EpochMilliseconds;
  speedKmh: number;
  closesSegment: number | null;
}

function buildSamples(start: EpochMilliseconds, segments: SpeedSegment[], step: Milliseconds): TimedSample[] {
  const samples: TimedSample[] = [];
  let segmentStart = start;
  let lastSpeed = STOPPED_SPEED_KMH;
  segments.forEach((segment, index) => {
    const segmentEnd = segmentStart + segment.duration;
    for (let at = segmentStart; at < segmentEnd; at += step) {
      samples.push({ at, speedKmh: segment.speedKmh, closesSegment: at === segmentStart && index > 0 ? index - 1 : null });
    }
    segmentStart = segmentEnd;
    lastSpeed = segment.speedKmh;
  });
  samples.push({ at: segmentStart, speedKmh: lastSpeed, closesSegment: segments.length - 1 });
  return samples;
}

function recordEffects(checks: CheckRecord[], effects: TripEffect[]): void {
  for (const effect of effects) {
    const current = checks[checks.length - 1];
    if (effect.type === 'checkStarted') {
      checks.push({
        index: checks.length,
        startedAt: effect.at,
        interval: effect.interval,
        reasons: effect.reasons,
        stages: [],
        outcome: null,
      });
    } else if (effect.type === 'stageEntered' && current) {
      current.stages.push({ stage: effect.stage, at: effect.at });
    } else if (effect.type === 'checkResolved' && current) {
      current.outcome = effect.outcome;
    }
  }
}

export interface RunScenarioOptions {
  settings?: ProfileSettings;
  step?: Milliseconds;
}

export function runScenario(
  scenario: Scenario,
  vehicleType: VehicleType,
  options: RunScenarioOptions = {},
): ScenarioRun {
  const settings = options.settings ?? getDefaultSettings(vehicleType);
  const step = options.step ?? SIMULATION_STEP;
  const plan = scenario.plan(settings);
  const startedAt = localTimeOnSameDay(
    SIMULATION_BASE_DATE,
    plan.startLocalHour,
    plan.startLocalMinute,
    SIMULATION_UTC_OFFSET_MINUTES,
  );
  let trip = startTrip({ vehicleType, settings, utcOffsetMinutes: SIMULATION_UTC_OFFSET_MINUTES, startedAt });
  const effects: TripEffect[] = [];
  const checks: CheckRecord[] = [];
  const checkpoints: Checkpoint[] = [];
  let pendingResponseAt: EpochMilliseconds | null = null;

  function apply(update: TripUpdate): void {
    trip = update.trip;
    effects.push(...update.effects);
    const before = checks.length;
    recordEffects(checks, update.effects);
    for (const check of checks.slice(before)) {
      const delay = plan.responder(check.index);
      pendingResponseAt = delay === null ? null : check.startedAt + delay;
    }
  }

  const samples = buildSamples(startedAt, plan.segments, step);
  for (const sample of samples) {
    if (pendingResponseAt !== null && pendingResponseAt <= sample.at) {
      const responseAt: EpochMilliseconds = pendingResponseAt;
      pendingResponseAt = null;
      apply(respondToCheck(trip, responseAt));
    }
    apply(processTripSpeedSample(trip, { at: sample.at, speedKmh: sample.speedKmh }));
    if (sample.closesSegment !== null) {
      checkpoints.push({
        segmentIndex: sample.closesSegment,
        at: sample.at,
        accumulatedDriving: trip.driveTimer.accumulatedDriving,
        breakOverdue: trip.driveTimer.breakReminderIssued,
        movement: trip.driveTimer.movement,
      });
    }
  }

  return {
    scenarioId: scenario.id,
    vehicleType,
    settings,
    startedAt,
    endedAt: startedAt + plan.segments.reduce((total, segment) => total + segment.duration, 0),
    effects,
    checks,
    checkpoints,
    finalTrip: trip,
  };
}

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}
