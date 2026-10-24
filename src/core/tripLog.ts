import type { ReducedIntervalReason } from './checkScheduler';
import { type AlertStage, STAGE_ORDER } from './escalation';
import type { TripEffect } from './trip';
import type { EpochMilliseconds, Milliseconds } from './types';

export interface CheckLogEntry {
  startedAt: EpochMilliseconds;
  interval: Milliseconds;
  reasons: ReducedIntervalReason[];
  maxStage: AlertStage;
  responseTime: Milliseconds | null;
}

export interface BreakLogEntry {
  stoppedSince: EpochMilliseconds;
  registeredAt: EpochMilliseconds;
}

export interface TripLog {
  checks: CheckLogEntry[];
  breaks: BreakLogEntry[];
  breakPreWarnings: EpochMilliseconds[];
  breakReminders: EpochMilliseconds[];
  stopRecommendations: EpochMilliseconds[];
}

function higherStage(first: AlertStage, second: AlertStage): AlertStage {
  return STAGE_ORDER.indexOf(second) > STAGE_ORDER.indexOf(first) ? second : first;
}

export function buildTripLog(effects: readonly TripEffect[]): TripLog {
  const log: TripLog = { checks: [], breaks: [], breakPreWarnings: [], breakReminders: [], stopRecommendations: [] };
  for (const effect of effects) {
    const current = log.checks[log.checks.length - 1];
    switch (effect.type) {
      case 'checkStarted':
        log.checks.push({
          startedAt: effect.at,
          interval: effect.interval,
          reasons: effect.reasons,
          maxStage: 'check',
          responseTime: null,
        });
        break;
      case 'stageEntered':
        if (current !== undefined) {
          current.maxStage = higherStage(current.maxStage, effect.stage);
        }
        break;
      case 'checkResolved':
        if (current !== undefined) {
          current.maxStage = effect.outcome.maxStage;
          current.responseTime = effect.outcome.responseTime;
        }
        break;
      case 'breakRegistered':
        log.breaks.push({ stoppedSince: effect.stoppedSince, registeredAt: effect.at });
        break;
      case 'breakPreWarning':
        log.breakPreWarnings.push(effect.at);
        break;
      case 'breakReminder':
        log.breakReminders.push(effect.at);
        break;
      case 'stopRecommended':
        log.stopRecommendations.push(effect.at);
        break;
    }
  }
  return log;
}

export function highestStageInLog(log: TripLog): AlertStage | null {
  return log.checks.reduce<AlertStage | null>(
    (highest, check) => (highest === null ? check.maxStage : higherStage(highest, check.maxStage)),
    null,
  );
}

export function averageResponseTime(log: TripLog): Milliseconds | null {
  const times = log.checks.flatMap((check) => (check.responseTime === null ? [] : [check.responseTime]));
  return times.length === 0 ? null : times.reduce((total, time) => total + time, 0) / times.length;
}
