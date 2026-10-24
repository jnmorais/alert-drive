import { describe, expect, it } from '@jest/globals';

import { localHourAt } from '../core/checkScheduler';
import { hours, minutes, seconds } from '../core/duration';
import type { Clock } from '../core/types';
import { systemClock } from '../services/systemClock';
import {
  createAcceleratedClock,
  DEFAULT_SPEED_FACTOR,
  isValidSpeedFactor,
  localTimeOnSameDay,
  SPEED_FACTOR_PRESETS,
} from './clock';

const SIMULATED_START = Date.UTC(2026, 9, 24, 1, 0, 0);
const REAL_START = 1_000_000;

function fakeRealClock(start = REAL_START): Clock & { advance(ms: number): void } {
  let current = start;
  return {
    now: () => current,
    advance(ms) {
      current += ms;
    },
  };
}

describe('RF14 - relógio acelerado', () => {
  it('começa no horário simulado escolhido', () => {
    const clock = createAcceleratedClock({ realClock: fakeRealClock(), simulatedStartAt: SIMULATED_START });
    expect(clock.now()).toBe(SIMULATED_START);
  });

  it('por padrão, 1 segundo real equivale a 1 minuto simulado', () => {
    const real = fakeRealClock();
    const clock = createAcceleratedClock({ realClock: real, simulatedStartAt: SIMULATED_START });
    real.advance(seconds(1));
    expect(DEFAULT_SPEED_FACTOR).toBe(60);
    expect(clock.now()).toBe(SIMULATED_START + minutes(1));
  });

  it.each(SPEED_FACTOR_PRESETS)('com fator %i, avança o tempo simulado proporcionalmente', (speedFactor) => {
    const real = fakeRealClock();
    const clock = createAcceleratedClock({ realClock: real, simulatedStartAt: SIMULATED_START, speedFactor });
    real.advance(seconds(10));
    expect(clock.now()).toBe(SIMULATED_START + seconds(10) * speedFactor);
  });

  it('com fator 1, acompanha o tempo real', () => {
    const real = fakeRealClock();
    const clock = createAcceleratedClock({ realClock: real, simulatedStartAt: SIMULATED_START, speedFactor: 1 });
    real.advance(minutes(3));
    expect(clock.now()).toBe(SIMULATED_START + minutes(3));
  });

  it('mudar o fator no meio preserva o tempo já simulado', () => {
    const real = fakeRealClock();
    const clock = createAcceleratedClock({ realClock: real, simulatedStartAt: SIMULATED_START, speedFactor: 60 });
    real.advance(seconds(10));
    clock.setSpeedFactor(300);
    real.advance(seconds(2));
    expect(clock.speedFactor()).toBe(300);
    expect(clock.now()).toBe(SIMULATED_START + minutes(10) + minutes(10));
  });

  it('pausado, o tempo simulado não avança', () => {
    const real = fakeRealClock();
    const clock = createAcceleratedClock({ realClock: real, simulatedStartAt: SIMULATED_START });
    real.advance(seconds(5));
    clock.pause();
    real.advance(seconds(30));
    expect(clock.isPaused()).toBe(true);
    expect(clock.now()).toBe(SIMULATED_START + minutes(5));
  });

  it('ao retomar, continua de onde parou', () => {
    const real = fakeRealClock();
    const clock = createAcceleratedClock({ realClock: real, simulatedStartAt: SIMULATED_START });
    real.advance(seconds(5));
    clock.pause();
    real.advance(seconds(30));
    clock.resume();
    real.advance(seconds(1));
    expect(clock.isPaused()).toBe(false);
    expect(clock.now()).toBe(SIMULATED_START + minutes(6));
  });

  it('retomar sem estar pausado não altera o tempo', () => {
    const real = fakeRealClock();
    const clock = createAcceleratedClock({ realClock: real, simulatedStartAt: SIMULATED_START });
    real.advance(seconds(2));
    clock.resume();
    expect(clock.now()).toBe(SIMULATED_START + minutes(2));
  });

  it('mudar o fator com o relógio pausado não altera o tempo parado', () => {
    const real = fakeRealClock();
    const clock = createAcceleratedClock({ realClock: real, simulatedStartAt: SIMULATED_START });
    clock.pause();
    clock.setSpeedFactor(10);
    real.advance(seconds(5));
    expect(clock.now()).toBe(SIMULATED_START);
    clock.resume();
    real.advance(seconds(1));
    expect(clock.now()).toBe(SIMULATED_START + seconds(10));
  });
});

describe('RF14 - conversão de atrasos para o agendamento dos disparos', () => {
  it('converte um atraso simulado em atraso real pelo fator', () => {
    const clock = createAcceleratedClock({ realClock: fakeRealClock(), simulatedStartAt: SIMULATED_START });
    expect(clock.toRealDelay(seconds(15))).toBe(250);
    expect(clock.toRealDelay(minutes(10))).toBe(seconds(10));
  });

  it('atraso negativo vira zero', () => {
    const clock = createAcceleratedClock({ realClock: fakeRealClock(), simulatedStartAt: SIMULATED_START });
    expect(clock.toRealDelay(-seconds(1))).toBe(0);
  });

  it('pausado, nenhum disparo deve acontecer', () => {
    const clock = createAcceleratedClock({ realClock: fakeRealClock(), simulatedStartAt: SIMULATED_START });
    clock.pause();
    expect(clock.toRealDelay(seconds(1))).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('RF14 - validação do fator de aceleração', () => {
  it.each([1, 0.5, 60, 3600])('aceita o fator %d', (speedFactor) => {
    expect(isValidSpeedFactor(speedFactor)).toBe(true);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('recusa o fator %d', (speedFactor) => {
    expect(isValidSpeedFactor(speedFactor)).toBe(false);
    expect(() =>
      createAcceleratedClock({ realClock: fakeRealClock(), simulatedStartAt: SIMULATED_START, speedFactor }),
    ).toThrow(RangeError);
  });

  it('recusa trocar para um fator inválido e mantém o anterior', () => {
    const clock = createAcceleratedClock({ realClock: fakeRealClock(), simulatedStartAt: SIMULATED_START });
    expect(() => clock.setSpeedFactor(0)).toThrow(RangeError);
    expect(clock.speedFactor()).toBe(DEFAULT_SPEED_FACTOR);
  });
});

describe('RF14 - horário de início configurável', () => {
  it.each([
    [-180, 2, 30],
    [-180, 23, 0],
    [0, 0, 0],
    [120, 5, 45],
  ])('com fuso %i, gera o horário local %i:%i no mesmo dia', (offset, hour, minute) => {
    const reference = Date.UTC(2026, 9, 24, 15, 0, 0);
    const start = localTimeOnSameDay(reference, hour, minute, offset);
    expect(localHourAt(start, offset)).toBe(hour);
    expect(((start + minutes(offset)) % hours(1)) / minutes(1)).toBe(minute);
    expect(Math.abs(start - reference)).toBeLessThan(hours(24) + hours(3));
  });

  it('a madrugada simulada é reconhecida pelo modo noturno', () => {
    const start = localTimeOnSameDay(Date.UTC(2026, 9, 24, 15), 1, 0, -180);
    expect(localHourAt(start, -180)).toBe(1);
  });
});

describe('Relógio do sistema', () => {
  it('devolve o horário atual do aparelho', () => {
    const before = Date.now();
    const now = systemClock.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
