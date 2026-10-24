export type Milliseconds = number;

export type EpochMilliseconds = number;

export interface Clock {
  now(): EpochMilliseconds;
}

export type VehicleType = 'truck' | 'bus' | 'car';

export const VEHICLE_TYPES: readonly VehicleType[] = ['truck', 'bus', 'car'];
