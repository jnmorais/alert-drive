import { describe, expect, it } from '@jest/globals';

import { minutes } from '../core/duration';
import { getDefaultSettings } from '../core/profiles';
import { buildHistoryCsvFile } from '../text/historyCsv';
import { exportTripHistory } from './historyExport';
import type { CompletedTrip } from './tripController';

const START = Date.UTC(2026, 10, 9, 15, 0);
const OFFSET = -180;

const trip: CompletedTrip = {
  config: { vehicleType: 'car', settings: getDefaultSettings('car'), utcOffsetMinutes: OFFSET, startedAt: START },
  simulationMode: true,
  endedAt: START + minutes(30),
  effects: [],
};

describe('RF12 - exportação do histórico gravado', () => {
  it('entrega o arquivo CSV de todas as viagens para o compartilhamento do aparelho', async () => {
    const shared: { fileName: string; content: string }[] = [];
    const result = await exportTripHistory({
      trips: [trip],
      at: START + minutes(40),
      utcOffsetMinutes: OFFSET,
      share: async (fileName, content) => {
        shared.push({ fileName, content });
      },
    });
    expect(result).toBe('shared');
    expect(shared).toEqual([buildHistoryCsvFile([trip], START + minutes(40), OFFSET)]);
  });

  it('sem viagens encerradas, não gera arquivo', async () => {
    let calls = 0;
    const result = await exportTripHistory({
      trips: [],
      at: START,
      utcOffsetMinutes: OFFSET,
      share: async () => {
        calls += 1;
      },
    });
    expect(result).toBe('empty');
    expect(calls).toBe(0);
  });

  it('informa a falha quando o aparelho não consegue gravar ou compartilhar o arquivo', async () => {
    const result = await exportTripHistory({
      trips: [trip],
      at: START,
      utcOffsetMinutes: OFFSET,
      share: async () => {
        throw new Error('compartilhamento indisponível');
      },
    });
    expect(result).toBe('failed');
  });
});
