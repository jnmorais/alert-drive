import type { ResponseContext, ResponseMethod } from '../../core/responsePolicy';
import type { EpochMilliseconds } from '../../core/types';

export interface DriverResponse {
  method: ResponseMethod;
  at: EpochMilliseconds;
}

export type ResponseListener = (response: DriverResponse) => void;

export interface ResponseProvider {
  readonly method: ResponseMethod;
  isAvailable(context: ResponseContext): boolean;
  start(listener: ResponseListener): void;
  stop(): void;
  isListening(): boolean;
}
