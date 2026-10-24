import { describe, expect, it } from '@jest/globals';

import { hours, minutes, seconds } from './duration';

describe('Conversão de durações para milissegundos', () => {
  it('converte segundos', () => {
    expect(seconds(15)).toBe(15_000);
  });

  it('converte minutos', () => {
    expect(minutes(5)).toBe(300_000);
  });

  it('converte horas, inclusive frações', () => {
    expect(hours(5.5)).toBe(19_800_000);
  });
});
