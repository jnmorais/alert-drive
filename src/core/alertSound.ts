import { effectiveChannels } from './alertChannels';
import { STAGE_BEHAVIOR, type SoundPattern } from './escalation';
import { isCheckActive, type TripEffect, type TripState } from './trip';

export interface AlertSoundCue {
  pattern: SoundPattern;
  volume: number;
  loop: boolean;
  key: string;
}

type NoticeEffectType = 'breakPreWarning' | 'breakReminder' | 'stopRecommended';

const NOTICE_EFFECT_TYPES: readonly TripEffect['type'][] = ['breakPreWarning', 'breakReminder', 'stopRecommended'];

function isNoticeEffect(effect: TripEffect): effect is Extract<TripEffect, { type: NoticeEffectType }> {
  return NOTICE_EFFECT_TYPES.includes(effect.type);
}

function soundAllowed(trip: TripState): boolean {
  return effectiveChannels(trip.channels).sound;
}

export function desiredAlertSound(trip: TripState | null): AlertSoundCue | null {
  if (trip === null || trip.escalation === null || !isCheckActive(trip) || !soundAllowed(trip)) {
    return null;
  }
  const { stage, checkStartedAt } = trip.escalation;
  const behavior = STAGE_BEHAVIOR[stage];
  return {
    pattern: behavior.sound,
    volume: behavior.relativeVolume,
    loop: behavior.sound === 'alarm',
    key: `${checkStartedAt}:${stage}`,
  };
}

export function noticeSound(effects: readonly TripEffect[], trip: TripState | null): AlertSoundCue | null {
  if (trip === null || !soundAllowed(trip) || desiredAlertSound(trip) !== null) {
    return null;
  }
  const notice = effects.find(isNoticeEffect);
  if (notice === undefined) {
    return null;
  }
  return {
    pattern: STAGE_BEHAVIOR.check.sound,
    volume: STAGE_BEHAVIOR.check.relativeVolume,
    loop: false,
    key: `${notice.type}:${notice.at}`,
  };
}
