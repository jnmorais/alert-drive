import { describe, expect, it } from '@jest/globals';

import { seconds } from './duration';
import {
  acknowledge,
  advanceEscalation,
  ALERT_MESSAGE,
  type EscalationState,
  isEscalationActive,
  nextStageDueAt,
  STAGE_BEHAVIOR,
  STAGE_ORDER,
  stageOffset,
  startEscalation,
} from './escalation';
import { getDefaultSettings } from './profiles';

const CHECK_AT = Date.UTC(2026, 9, 24, 9, 0, 0);

const truck = getDefaultSettings('truck');
const bus = getDefaultSettings('bus');
const car = getDefaultSettings('car');

describe('RF08 - horários das etapas por perfil (Quadro 1)', () => {
  it.each([
    ['caminhão', truck, [0, 15, 30, 45]],
    ['ônibus', bus, [0, 15, 25, 35]],
    ['automóvel', car, [0, 15, 30, 45]],
  ] as const)('perfil %s dispara as etapas nos segundos do Quadro 1', (_label, settings, expected) => {
    expect(STAGE_ORDER.map((stage) => stageOffset(stage, settings))).toEqual(
      expected.map((value) => seconds(value)),
    );
  });

  it.each([
    ['caminhão', truck, [15, 30, 45]],
    ['ônibus', bus, [15, 25, 35]],
  ] as const)('perfil %s sem resposta passa por todas as etapas até a máxima', (_label, settings, expected) => {
    const { state, transitions } = advanceEscalation(
      startEscalation(CHECK_AT),
      CHECK_AT + seconds(120),
      settings,
    );
    expect(transitions).toEqual([
      { stage: 'preventive', dueAt: CHECK_AT + seconds(expected[0]) },
      { stage: 'mandatory', dueAt: CHECK_AT + seconds(expected[1]) },
      { stage: 'maximum', dueAt: CHECK_AT + seconds(expected[2]) },
    ]);
    expect(state.stage).toBe('maximum');
  });
});

describe('RF07 - ausência de resposta inicia o escalonamento', () => {
  it('a verificação começa na etapa de verificação, ativa e sem resultado', () => {
    expect(startEscalation(CHECK_AT)).toEqual({ checkStartedAt: CHECK_AT, stage: 'check', outcome: null });
    expect(isEscalationActive(startEscalation(CHECK_AT))).toBe(true);
  });

  it('dentro da janela de 15 segundos nada muda', () => {
    const update = advanceEscalation(startEscalation(CHECK_AT), CHECK_AT + seconds(15) - 1, car);
    expect(update.transitions).toEqual([]);
    expect(update.state.stage).toBe('check');
  });

  it('ao fim da janela sem resposta entra na etapa preventiva', () => {
    const update = advanceEscalation(startEscalation(CHECK_AT), CHECK_AT + seconds(15), car);
    expect(update.transitions).toEqual([{ stage: 'preventive', dueAt: CHECK_AT + seconds(15) }]);
  });
});

describe('RF08 - etapa máxima contínua até o reconhecimento', () => {
  it('permanece na etapa máxima sem novas transições', () => {
    const atMaximum = advanceEscalation(startEscalation(CHECK_AT), CHECK_AT + seconds(45), car).state;
    const later = advanceEscalation(atMaximum, CHECK_AT + seconds(600), car);
    expect(later).toEqual({ state: atMaximum, transitions: [] });
    expect(nextStageDueAt(atMaximum, car)).toBeNull();
    expect(isEscalationActive(atMaximum)).toBe(true);
  });
});

describe('RF08 - resposta encerra o alerta em qualquer etapa', () => {
  it.each([
    ['verificação', seconds(4), 'check', 6],
    ['preventiva', seconds(20), 'preventive', 7],
    ['obrigatória', seconds(31), 'mandatory', 8],
    ['máxima', seconds(90), 'maximum', 9],
  ] as const)(
    'resposta na etapa %s registra o tempo total e a etapa máxima',
    (_label, delay, maxStage, simulatedLevel) => {
      let state: EscalationState = startEscalation(CHECK_AT);
      state = advanceEscalation(state, CHECK_AT + delay, truck).state;
      const update = acknowledge(state, CHECK_AT + delay, truck);
      expect(update.outcome).toEqual({
        respondedAt: CHECK_AT + delay,
        responseTime: delay,
        maxStage,
        simulatedLevel,
      });
      expect(isEscalationActive(update.state)).toBe(false);
      expect(nextStageDueAt(update.state, truck)).toBeNull();
    },
  );

  it('resposta exatamente no fim da janela já conta a etapa preventiva', () => {
    const update = acknowledge(startEscalation(CHECK_AT), CHECK_AT + seconds(15), car);
    expect(update.outcome?.maxStage).toBe('preventive');
  });

  it('resposta tardia sem atualização anterior considera as etapas já vencidas', () => {
    const update = acknowledge(startEscalation(CHECK_AT), CHECK_AT + seconds(26), bus);
    expect(update.outcome).toMatchObject({ maxStage: 'mandatory', simulatedLevel: 8 });
    expect(update.transitions.map((transition) => transition.stage)).toEqual(['preventive', 'mandatory']);
  });

  it('depois de encerrado, ignora novas respostas e o passar do tempo', () => {
    const resolved = acknowledge(startEscalation(CHECK_AT), CHECK_AT + seconds(3), car).state;
    expect(acknowledge(resolved, CHECK_AT + seconds(5), car)).toEqual({
      state: resolved,
      transitions: [],
      outcome: null,
    });
    expect(advanceEscalation(resolved, CHECK_AT + seconds(60), car)).toEqual({
      state: resolved,
      transitions: [],
    });
  });

  it('ignora resposta com horário anterior à verificação', () => {
    const state = startEscalation(CHECK_AT);
    expect(acknowledge(state, CHECK_AT - 1, car)).toEqual({ state, transitions: [], outcome: null });
  });
});

describe('RF08 - comportamento de cada etapa (Quadro 1)', () => {
  it('mapeia as etapas aos níveis simulados 6, 7, 8 e 9', () => {
    expect(STAGE_ORDER.map((stage) => STAGE_BEHAVIOR[stage].simulatedLevel)).toEqual([6, 7, 8, 9]);
  });

  it('a verificação usa tom curto e mensagem na tela, sem vibração', () => {
    expect(STAGE_BEHAVIOR.check).toMatchObject({ sound: 'shortTone', visual: 'message', vibration: 'none' });
  });

  it('a etapa preventiva usa volume de 50%, faixa fixa e pulsos curtos', () => {
    expect(STAGE_BEHAVIOR.preventive).toMatchObject({
      relativeVolume: 0.5,
      visual: 'fixedBanner',
      vibration: 'shortPulses',
    });
  });

  it('a etapa obrigatória usa volume de 75%, visual piscante, vibração contínua e voz', () => {
    expect(STAGE_BEHAVIOR.mandatory).toMatchObject({
      relativeVolume: 0.75,
      visual: 'blinking',
      vibration: 'continuous',
      voiceMessage: 'Atenção. Sinais de sonolência. Procure um local seguro para parar.',
    });
  });

  it('a etapa máxima usa volume de 100% e tela cheia', () => {
    expect(STAGE_BEHAVIOR.maximum).toMatchObject({ relativeVolume: 1, visual: 'fullScreen' });
  });

  it('a intensidade sonora nunca diminui de uma etapa para a seguinte', () => {
    const volumes = STAGE_ORDER.map((stage) => STAGE_BEHAVIOR[stage].relativeVolume);
    expect([...volumes].sort((a, b) => a - b)).toEqual(volumes);
  });
});

describe('RF11 - mensagem de voz igual ao texto da tela', () => {
  it.each(STAGE_ORDER)('etapa %s: se houver voz, ela repete exatamente o texto da tela', (stage) => {
    const { voiceMessage, screenMessage } = STAGE_BEHAVIOR[stage];
    if (voiceMessage !== null) {
      expect(voiceMessage).toBe(screenMessage);
    }
  });

  it('a etapa obrigatória fala a mensagem de alerta', () => {
    expect(STAGE_BEHAVIOR.mandatory.voiceMessage).toBe(ALERT_MESSAGE);
    expect(STAGE_BEHAVIOR.mandatory.screenMessage).toBe(ALERT_MESSAGE);
  });
});

describe('RNF05 - etapas emitidas sem atraso acumulado', () => {
  it('informa o horário exato da próxima etapa para o agendamento do disparo', () => {
    let state = startEscalation(CHECK_AT);
    const dueTimes: number[] = [];
    for (let due = nextStageDueAt(state, bus); due !== null; due = nextStageDueAt(state, bus)) {
      dueTimes.push(due - CHECK_AT);
      state = advanceEscalation(state, due, bus).state;
    }
    expect(dueTimes).toEqual([seconds(15), seconds(25), seconds(35)]);
  });

  it('uma atualização atrasada devolve as etapas vencidas com o horário previsto, não o do atraso', () => {
    const update = advanceEscalation(startEscalation(CHECK_AT), CHECK_AT + seconds(33), truck);
    expect(update.transitions).toEqual([
      { stage: 'preventive', dueAt: CHECK_AT + seconds(15) },
      { stage: 'mandatory', dueAt: CHECK_AT + seconds(30) },
    ]);
  });
});
