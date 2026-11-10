import { describe, expect, it } from '@jest/globals';

import { seconds } from './duration';
import { GPS_SIGNAL_TIMEOUT, KMH_PER_METER_PER_SECOND, speedKmhFromReading } from './gpsSpeed';

const AT = Date.UTC(2026, 10, 10, 12, 0);

describe('RF03 - velocidade lida do GPS', () => {
  it('converte metros por segundo em km/h', () => {
    expect(KMH_PER_METER_PER_SECOND).toBe(3.6);
    expect(speedKmhFromReading({ at: AT, speedMetersPerSecond: 25 })).toBe(90);
    expect(speedKmhFromReading({ at: AT, speedMetersPerSecond: 0 })).toBe(0);
  });

  it('ignora leituras sem velocidade confiável em vez de estimar pela posição', () => {
    expect(speedKmhFromReading({ at: AT, speedMetersPerSecond: null })).toBeNull();
    expect(speedKmhFromReading({ at: AT, speedMetersPerSecond: -1 })).toBeNull();
    expect(speedKmhFromReading({ at: AT, speedMetersPerSecond: Number.NaN })).toBeNull();
    expect(speedKmhFromReading({ at: AT, speedMetersPerSecond: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it('considera o sinal perdido depois de 10 s sem leitura válida', () => {
    expect(GPS_SIGNAL_TIMEOUT).toBe(seconds(10));
  });
});
