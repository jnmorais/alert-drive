import { describe, expect, it } from '@jest/globals';

import {
  allowedResponseMethods,
  hasHandsFreeResponse,
  isResponseMethodAllowed,
  type ResponseContext,
  type ResponseMethod,
} from './responsePolicy';

const moving: ResponseContext = { movement: 'moving', simulationMode: false };
const stopped: ResponseContext = { movement: 'stopped', simulationMode: false };
const simulatedMoving: ResponseContext = { movement: 'moving', simulationMode: true };

const allMethods: ResponseMethod[] = ['touch', 'voice', 'proximity'];

describe('RF06 - toque só com o veículo parado', () => {
  it('recusa o toque com o veículo em movimento', () => {
    expect(isResponseMethodAllowed('touch', moving)).toBe(false);
  });

  it('aceita o toque com o veículo parado', () => {
    expect(isResponseMethodAllowed('touch', stopped)).toBe(true);
  });

  it('aceita o toque no modo simulação, mesmo com o veículo simulado em movimento', () => {
    expect(isResponseMethodAllowed('touch', simulatedMoving)).toBe(true);
  });
});

describe('RF06 - resposta sem segurar o aparelho', () => {
  it.each(['voice', 'proximity'] as const)('aceita %s em qualquer situação', (method) => {
    expect(isResponseMethodAllowed(method, moving)).toBe(true);
    expect(isResponseMethodAllowed(method, stopped)).toBe(true);
  });

  it('em movimento, só sobram as formas sem toque', () => {
    expect(allowedResponseMethods(allMethods, moving)).toEqual(['voice', 'proximity']);
  });

  it('parado, todas as formas suportadas valem', () => {
    expect(allowedResponseMethods(allMethods, stopped)).toEqual(allMethods);
  });

  it('com só o toque disponível, em movimento não há forma de resposta fora da simulação', () => {
    expect(allowedResponseMethods(['touch'], moving)).toEqual([]);
    expect(allowedResponseMethods(['touch'], simulatedMoving)).toEqual(['touch']);
  });

  it('identifica se o aparelho oferece alguma resposta sem as mãos', () => {
    expect(hasHandsFreeResponse(['touch'])).toBe(false);
    expect(hasHandsFreeResponse(['touch', 'voice'])).toBe(true);
    expect(hasHandsFreeResponse(['proximity'])).toBe(true);
  });
});
