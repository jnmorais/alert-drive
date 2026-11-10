import { describe, expect, it } from '@jest/globals';

import { minutes, seconds } from '../core/duration';
import { getDefaultSettings } from '../core/profiles';
import type { CompletedTrip } from '../state/tripController';
import {
  buildHistoryCsv,
  buildHistoryCsvFile,
  EXPORT_PRIVACY_NOTE,
  EXPORT_RESULT_NOTES,
  formatLocalDateTimeWithSeconds,
  HISTORY_CSV_HEADER,
  historyExportFileName,
  UTF8_BYTE_ORDER_MARK,
} from './historyCsv';

const START = Date.UTC(2026, 9, 24, 12, 5);
const OFFSET = -180;

function completedTrip(overrides: Partial<CompletedTrip> = {}): CompletedTrip {
  return {
    config: { vehicleType: 'truck', settings: getDefaultSettings('truck'), utcOffsetMinutes: OFFSET, startedAt: START },
    simulationMode: false,
    endedAt: START + minutes(75),
    effects: [],
    ...overrides,
  };
}

const eventfulTrip = completedTrip({
  effects: [
    { type: 'checkStarted', at: START + minutes(10), interval: minutes(10), reasons: [] },
    {
      type: 'checkResolved',
      at: START + minutes(10) + seconds(4),
      outcome: { respondedAt: START + minutes(10) + seconds(4), responseTime: seconds(4), maxStage: 'check', simulatedLevel: 6 },
    },
    { type: 'breakPreWarning', at: START + minutes(15) },
    { type: 'checkStarted', at: START + minutes(20), interval: minutes(5), reasons: ['breakOverdue'] },
    { type: 'stageEntered', at: START + minutes(20) + seconds(15), stage: 'preventive' },
    { type: 'stageEntered', at: START + minutes(20) + seconds(30), stage: 'mandatory' },
    {
      type: 'checkResolved',
      at: START + minutes(20) + seconds(32.5),
      outcome: {
        respondedAt: START + minutes(20) + seconds(32.5),
        responseTime: seconds(32.5),
        maxStage: 'mandatory',
        simulatedLevel: 8,
      },
    },
    { type: 'stopRecommended', at: START + minutes(20) + seconds(32.5) },
    { type: 'breakRegistered', at: START + minutes(60), stoppedSince: START + minutes(40) },
    { type: 'checkStarted', at: START + minutes(70), interval: minutes(5), reasons: ['night', 'recurrentEpisodes'] },
    { type: 'stageEntered', at: START + minutes(70) + seconds(15), stage: 'preventive' },
    { type: 'stageEntered', at: START + minutes(70) + seconds(45), stage: 'maximum' },
  ],
});

function csvLines(csv: string): string[] {
  return csv.split('\r\n');
}

describe('RF12 - exportação do histórico em CSV', () => {
  it('começa pelo cabeçalho com as colunas do registro de eventos', () => {
    expect(csvLines(buildHistoryCsv([]))).toEqual([HISTORY_CSV_HEADER.join(';'), '']);
    expect(HISTORY_CSV_HEADER).toEqual([
      'viagem',
      'perfil',
      'modo',
      'evento',
      'data_hora',
      'intervalo_min',
      'motivos_reducao',
      'tempo_ate_resposta_s',
      'etapa_maxima',
      'nivel_simulado',
      'parada_desde',
    ]);
  });

  it('registra início e fim de uma viagem sem eventos, com data, hora e perfil', () => {
    expect(csvLines(buildHistoryCsv([completedTrip()])).slice(1)).toEqual([
      '1;Caminhão;real;inicio_viagem;24/10/2026 09:05:00;;;;;;',
      '1;Caminhão;real;fim_viagem;24/10/2026 10:20:00;;;;;;',
      '',
    ]);
  });

  it('lista verificações, avisos, pausas e recomendações em ordem de horário', () => {
    expect(csvLines(buildHistoryCsv([eventfulTrip])).slice(1)).toEqual([
      '1;Caminhão;real;inicio_viagem;24/10/2026 09:05:00;;;;;;',
      '1;Caminhão;real;verificacao;24/10/2026 09:15:00;10;;4;Verificação;6;',
      '1;Caminhão;real;pre_aviso_pausa;24/10/2026 09:20:00;;;;;;',
      '1;Caminhão;real;verificacao;24/10/2026 09:25:00;5;Pausa vencida;32,5;Etapa 2 – Obrigatória;8;',
      '1;Caminhão;real;recomendacao_parada;24/10/2026 09:25:32;;;;;;',
      '1;Caminhão;real;pausa_registrada;24/10/2026 10:05:00;;;;;;24/10/2026 09:45:00',
      '1;Caminhão;real;verificacao;24/10/2026 10:15:00;5;Madrugada, Episódios recorrentes;sem resposta;Etapa 3 – Máxima;9;',
      '1;Caminhão;real;fim_viagem;24/10/2026 10:20:00;;;;;;',
      '',
    ]);
  });

  it('numera as viagens e identifica as feitas no modo simulação', () => {
    const second = completedTrip({
      config: { vehicleType: 'bus', settings: getDefaultSettings('bus'), utcOffsetMinutes: OFFSET, startedAt: START + minutes(120) },
      simulationMode: true,
      endedAt: START + minutes(150),
    });
    const lines = csvLines(buildHistoryCsv([completedTrip(), second]));
    expect(lines[3]).toBe('2;Ônibus;simulação;inicio_viagem;24/10/2026 11:05:00;;;;;;');
    expect(lines[4]).toBe('2;Ônibus;simulação;fim_viagem;24/10/2026 11:35:00;;;;;;');
  });

  it('inclui os segundos na data e hora local', () => {
    expect(formatLocalDateTimeWithSeconds(START + seconds(7.9), OFFSET)).toBe('24/10/2026 09:05:07');
    expect(formatLocalDateTimeWithSeconds(Date.UTC(2026, 9, 25, 1, 30, 59), OFFSET)).toBe('24/10/2026 22:30:59');
  });
});

describe('RF12 - arquivo CSV exportado', () => {
  it('dá ao arquivo um nome com a data e a hora local da exportação', () => {
    expect(historyExportFileName(Date.UTC(2026, 10, 9, 2, 7), OFFSET)).toBe('alert-drive-historico-2026-11-08-2307.csv');
  });

  it('marca o arquivo como UTF-8 para os acentos aparecerem certos na planilha', () => {
    const file = buildHistoryCsvFile([completedTrip()], START, OFFSET);
    expect(file.fileName).toBe('alert-drive-historico-2026-10-24-0905.csv');
    expect(file.content.startsWith(UTF8_BYTE_ORDER_MARK)).toBe(true);
    expect(file.content.slice(UTF8_BYTE_ORDER_MARK.length)).toBe(buildHistoryCsv([completedTrip()]));
  });
});

describe('RF12 e RNF04 - textos da exportação do histórico', () => {
  it('avisa o resultado e que o arquivo só sai do aparelho por escolha do usuário', () => {
    expect(EXPORT_RESULT_NOTES.shared).toBe('Arquivo CSV do histórico gerado.');
    expect(EXPORT_RESULT_NOTES.empty).toBe('Não há viagens encerradas para exportar.');
    expect(EXPORT_RESULT_NOTES.failed).toBe('Não foi possível exportar o histórico neste aparelho.');
    expect(EXPORT_PRIVACY_NOTE).toBe('O arquivo só sai do aparelho se você escolher para onde enviá-lo.');
  });
});
