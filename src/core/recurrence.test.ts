import { describe, expect, it } from '@jest/globals';

import { selectCheckInterval } from './checkScheduler';
import { minutes } from './duration';
import type { AlertStage } from './escalation';
import { getDefaultSettings } from './profiles';
import {
  createRecurrenceTracker,
  isSevereStage,
  recordEscalationResult,
  type RecurrenceState,
  registerBreak,
} from './recurrence';

function recordAll(stages: AlertStage[], initial: RecurrenceState = createRecurrenceTracker()) {
  let state = initial;
  const recommendations: boolean[] = [];
  for (const stage of stages) {
    const update = recordEscalationResult(state, stage);
    state = update.state;
    recommendations.push(update.recommendImmediateStop);
  }
  return { state, recommendations };
}

describe('RF13 - eventos que contam como episódio grave', () => {
  it.each([
    ['check', false],
    ['preventive', false],
    ['mandatory', true],
    ['maximum', true],
  ] as const)('etapa %s é grave: %s', (stage, expected) => {
    expect(isSevereStage(stage)).toBe(expected);
  });
});

describe('RF13 - dois episódios seguidos na etapa 2 ou acima', () => {
  it('um único episódio grave não aciona a regra', () => {
    const { state, recommendations } = recordAll(['mandatory']);
    expect(recommendations).toEqual([false]);
    expect(state.reducedIntervalActive).toBe(false);
  });

  it.each([
    ['obrigatória e obrigatória', ['mandatory', 'mandatory']],
    ['obrigatória e máxima', ['mandatory', 'maximum']],
    ['máxima e máxima', ['maximum', 'maximum']],
  ] as const)('%s recomendam parada imediata e reduzem o intervalo', (_label, stages) => {
    const { state, recommendations } = recordAll([...stages]);
    expect(recommendations).toEqual([false, true]);
    expect(state.reducedIntervalActive).toBe(true);
  });

  it('episódios graves separados por um evento leve não são consecutivos', () => {
    const { state, recommendations } = recordAll(['mandatory', 'preventive', 'maximum']);
    expect(recommendations).toEqual([false, false, false]);
    expect(state.reducedIntervalActive).toBe(false);
  });

  it('recomenda parada de novo a cada novo episódio grave seguido', () => {
    const { recommendations } = recordAll(['mandatory', 'maximum', 'maximum']);
    expect(recommendations).toEqual([false, true, true]);
  });

  it('um evento leve depois do gatilho não desliga o intervalo reduzido', () => {
    const { state, recommendations } = recordAll(['mandatory', 'mandatory', 'check', 'preventive']);
    expect(recommendations).toEqual([false, true, false, false]);
    expect(state).toEqual({ consecutiveSevereEvents: 0, reducedIntervalActive: true });
  });
});

describe('RF13 - redução válida até a próxima pausa registrada', () => {
  it('a pausa registrada desliga a redução e zera a sequência', () => {
    const triggered = recordAll(['maximum', 'maximum']).state;
    expect(registerBreak()).toEqual({ consecutiveSevereEvents: 0, reducedIntervalActive: false });
    expect(triggered.reducedIntervalActive).toBe(true);
  });

  it('depois da pausa, um único episódio grave não aciona a regra de novo', () => {
    const { recommendations } = recordAll(['mandatory'], registerBreak());
    expect(recommendations).toEqual([false]);
  });

  it('com a redução ativa, o agendamento usa 5 minutos e informa o motivo', () => {
    const { state } = recordAll(['mandatory', 'mandatory']);
    const selection = selectCheckInterval(getDefaultSettings('car'), {
      localHour: 14,
      breakOverdue: false,
      recurrentEpisodesReduction: state.reducedIntervalActive,
    });
    expect(selection).toEqual({ interval: minutes(5), reasons: ['recurrentEpisodes'] });
  });
});
