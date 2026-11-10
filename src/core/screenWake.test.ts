import { describe, expect, it } from '@jest/globals';

import { getDefaultSettings } from './profiles';
import { shouldKeepScreenAwake } from './screenWake';
import { startTrip } from './trip';

describe('RNF06 - tela ligada durante a viagem', () => {
  it('mantém a tela ligada enquanto há viagem e libera sem viagem', () => {
    const trip = startTrip({
      vehicleType: 'truck',
      settings: getDefaultSettings('truck'),
      utcOffsetMinutes: -180,
      startedAt: Date.UTC(2026, 10, 10, 12, 0),
    });
    expect(shouldKeepScreenAwake(trip)).toBe(true);
    expect(shouldKeepScreenAwake(null)).toBe(false);
  });
});
