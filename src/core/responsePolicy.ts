import type { MovementState } from './driveTimer';

export type ResponseMethod = 'touch' | 'voice' | 'proximity';

export const HANDS_FREE_METHODS: readonly ResponseMethod[] = ['voice', 'proximity'];

export interface ResponseContext {
  movement: MovementState;
  simulationMode: boolean;
}

export function isResponseMethodAllowed(method: ResponseMethod, context: ResponseContext): boolean {
  if (method !== 'touch') {
    return true;
  }
  return context.simulationMode || context.movement === 'stopped';
}

export function allowedResponseMethods(
  supported: readonly ResponseMethod[],
  context: ResponseContext,
): ResponseMethod[] {
  return supported.filter((method) => isResponseMethodAllowed(method, context));
}

export function hasHandsFreeResponse(supported: readonly ResponseMethod[]): boolean {
  return supported.some((method) => HANDS_FREE_METHODS.includes(method));
}
