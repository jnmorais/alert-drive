import { seconds } from './duration';
import type { AlertStage } from './escalation';
import type { TripEffect } from './trip';
import type { EpochMilliseconds, Milliseconds } from './types';

export const RNF05_DELAY_TARGET: Milliseconds = seconds(1);

export type EmissionDelayEffect = Extract<TripEffect, { type: 'emissionDelay' }>;

export interface EmissionDelaySummary {
  count: number;
  maximum: Milliseconds;
  average: Milliseconds;
  overTarget: number;
}

function emittedStage(effect: TripEffect): AlertStage | null {
  if (effect.type === 'checkStarted') {
    return 'check';
  }
  return effect.type === 'stageEntered' ? effect.stage : null;
}

export function measureEmissionDelays(
  effects: readonly TripEffect[],
  emittedAt: EpochMilliseconds,
  toRealDelay: (simulatedDelay: Milliseconds) => Milliseconds,
): EmissionDelayEffect[] {
  return effects.flatMap((effect) => {
    const stage = emittedStage(effect);
    if (stage === null) {
      return [];
    }
    const delay = toRealDelay(Math.max(0, emittedAt - effect.at));
    return Number.isFinite(delay) ? [{ type: 'emissionDelay' as const, at: effect.at, stage, delay }] : [];
  });
}

export function emissionDelaysOf(effects: readonly TripEffect[]): EmissionDelayEffect[] {
  return effects.filter((effect): effect is EmissionDelayEffect => effect.type === 'emissionDelay');
}

export function summarizeEmissionDelays(effects: readonly TripEffect[]): EmissionDelaySummary | null {
  const delays = emissionDelaysOf(effects).map((effect) => effect.delay);
  if (delays.length === 0) {
    return null;
  }
  return {
    count: delays.length,
    maximum: Math.max(...delays),
    average: delays.reduce((total, delay) => total + delay, 0) / delays.length,
    overTarget: delays.filter((delay) => delay >= RNF05_DELAY_TARGET).length,
  };
}
