import { describe, expect, it } from '@jest/globals';

import { minutes } from '../../core/duration';
import { getDefaultSettings } from '../../core/profiles';
import { effectRowValues, rowsToTrip, type TripEventRow, type TripRow } from './tripRows';

const START = Date.UTC(2026, 9, 24, 12, 0);

const tripRow: TripRow = {
  id: 1,
  vehicle_type: 'bus',
  started_at: START,
  ended_at: START + minutes(30),
  utc_offset_minutes: -180,
  simulation_mode: 0,
  settings: JSON.stringify(getDefaultSettings('bus')),
};

function eventRow(position: number, type: string, data: string): TripEventRow {
  return { trip_id: 1, position, type, at: START + minutes(position), data };
}

describe('RF12 - conversão entre viagem e linhas do banco', () => {
  it('separa tipo e horário do restante do evento', () => {
    expect(effectRowValues(4, 2, { type: 'stopRecommended', at: START })).toEqual([4, 2, 'stopRecommended', START, '{}']);
  });

  it('remonta os eventos na ordem gravada', () => {
    const trip = rowsToTrip(tripRow, [
      eventRow(1, 'breakReminder', '{}'),
      eventRow(0, 'breakPreWarning', '{}'),
    ]);
    expect(trip?.effects.map((effect) => effect.type)).toEqual(['breakPreWarning', 'breakReminder']);
  });

  it('descarta uma viagem com perfil desconhecido', () => {
    expect(rowsToTrip({ ...tripRow, vehicle_type: 'moto' }, [])).toBeNull();
  });

  it('descarta uma viagem com configurações ilegíveis', () => {
    expect(rowsToTrip({ ...tripRow, settings: '{quebrado' }, [])).toBeNull();
    expect(rowsToTrip({ ...tripRow, settings: '[1, 2]' }, [])).toBeNull();
    expect(rowsToTrip({ ...tripRow, settings: 'null' }, [])).toBeNull();
  });

  it('ignora eventos de tipo desconhecido ou com dados ilegíveis, sem perder a viagem', () => {
    const trip = rowsToTrip(tripRow, [
      eventRow(0, 'unknownEvent', '{}'),
      eventRow(1, 'stopRecommended', 'não é json'),
      eventRow(2, 'toString', '{}'),
      eventRow(3, 'breakReminder', '{}'),
    ]);
    expect(trip?.effects).toEqual([{ type: 'breakReminder', at: START + minutes(3) }]);
  });
});
