import type { ProfileSettings } from '../../core/profiles';
import type { TripEffect } from '../../core/trip';
import { VEHICLE_TYPES, type VehicleType } from '../../core/types';
import type { CompletedTrip } from '../../state/tripController';
import type { SqlValue } from './sqlDatabase';

export interface TripRow {
  id: number;
  vehicle_type: string;
  started_at: number;
  ended_at: number;
  utc_offset_minutes: number;
  simulation_mode: number;
  settings: string;
}

export interface TripEventRow {
  trip_id: number;
  position: number;
  type: string;
  at: number;
  data: string;
}

const EFFECT_TYPES: Readonly<Record<TripEffect['type'], true>> = {
  breakPreWarning: true,
  breakReminder: true,
  breakRegistered: true,
  checkStarted: true,
  stageEntered: true,
  checkResolved: true,
  stopRecommended: true,
};

function isEffectType(type: string): type is TripEffect['type'] {
  return Object.hasOwn(EFFECT_TYPES, type);
}

function isVehicleType(value: string): value is VehicleType {
  return (VEHICLE_TYPES as readonly string[]).includes(value);
}

function parseObject(json: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function tripRowValues(trip: CompletedTrip): SqlValue[] {
  const { vehicleType, startedAt, utcOffsetMinutes, settings } = trip.config;
  return [vehicleType, startedAt, trip.endedAt, utcOffsetMinutes, trip.simulationMode ? 1 : 0, JSON.stringify(settings)];
}

export function effectRowValues(tripId: number, position: number, effect: TripEffect): SqlValue[] {
  const { type, at, ...data } = effect;
  return [tripId, position, type, at, JSON.stringify(data)];
}

function rowToEffect(row: TripEventRow): TripEffect | null {
  const data = parseObject(row.data);
  if (data === null || !isEffectType(row.type)) {
    return null;
  }
  return { ...data, type: row.type, at: row.at } as TripEffect;
}

export function rowsToTrip(row: TripRow, events: readonly TripEventRow[]): CompletedTrip | null {
  const settings = parseObject(row.settings);
  if (settings === null || !isVehicleType(row.vehicle_type)) {
    return null;
  }
  return {
    config: {
      vehicleType: row.vehicle_type,
      settings: settings as unknown as ProfileSettings,
      utcOffsetMinutes: row.utc_offset_minutes,
      startedAt: row.started_at,
    },
    simulationMode: row.simulation_mode === 1,
    endedAt: row.ended_at,
    effects: [...events]
      .sort((first, second) => first.position - second.position)
      .map(rowToEffect)
      .filter((effect): effect is TripEffect => effect !== null),
  };
}
