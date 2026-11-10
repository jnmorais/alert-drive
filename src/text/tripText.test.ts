import { describe, expect, it } from '@jest/globals';

import { hours, minutes, seconds } from '../core/duration';
import type { TripStatus } from '../core/tripStatus';
import {
  breakMessage,
  checkMessage,
  formatElapsed,
  formatRemaining,
  intervalMessage,
  KEEP_APP_OPEN_NOTE,
  movementLabel,
  stopMessage,
} from './tripText';

describe('RNF06 - aviso de manter o app aberto durante a viagem', () => {
  it('avisa que a tela fica ligada e que o app precisa ficar aberto', () => {
    expect(KEEP_APP_OPEN_NOTE).toBe('A tela fica ligada durante a viagem. Mantenha o app aberto.');
  });
});

const baseStatus: TripStatus = {
  movement: 'moving',
  hasSpeedData: true,
  drivingTime: minutes(30),
  breakPhase: 'normal',
  timeUntilBreakReminder: hours(1.5),
  stoppedFor: null,
  breakRemaining: null,
  checkPhase: 'counting',
  timeUntilNextCheck: minutes(10),
  checkInterval: { interval: minutes(15), reasons: [] },
  stopRecommended: false,
};

describe('RF03 - textos do tempo de direção', () => {
  it('mostra tempo decorrido em minutos inteiros, arredondando para baixo', () => {
    expect(formatElapsed(0)).toBe('0 min');
    expect(formatElapsed(seconds(59))).toBe('0 min');
    expect(formatElapsed(hours(1) + minutes(20) + seconds(40))).toBe('1 h 20 min');
  });

  it('mostra tempo restante em minutos inteiros, arredondando para cima', () => {
    expect(formatRemaining(0)).toBe('0 min');
    expect(formatRemaining(seconds(20))).toBe('1 min');
    expect(formatRemaining(minutes(10))).toBe('10 min');
  });

  it('indica se o veículo está em movimento, parado ou sem dados do GPS', () => {
    expect(movementLabel(baseStatus)).toBe('Em movimento');
    expect(movementLabel({ ...baseStatus, movement: 'stopped' })).toBe('Parado');
    expect(movementLabel({ ...baseStatus, movement: 'stopped', hasSpeedData: false })).toBe(
      'Aguardando a velocidade do GPS',
    );
  });

  it('não mostra mensagem de parada com o veículo em movimento', () => {
    expect(stopMessage(baseStatus)).toBeNull();
  });

  it('mostra quanto falta para a parada contar como pausa', () => {
    const status = { ...baseStatus, movement: 'stopped' as const, stoppedFor: minutes(5), breakRemaining: minutes(10) };
    expect(stopMessage(status)).toBe('Parado há 5 min. Faltam 10 min para contar como pausa.');
  });

  it('mostra a pausa registrada', () => {
    const status = { ...baseStatus, movement: 'stopped' as const, stoppedFor: minutes(16), breakRemaining: 0 };
    expect(stopMessage(status)).toBe('Pausa registrada. Tempo de direção zerado.');
  });
});

describe('RF04 - textos do pré-aviso e do lembrete de pausa', () => {
  it('mostra quanto falta para a pausa', () => {
    expect(breakMessage(baseStatus, minutes(15))).toEqual({ text: 'Pausa em 1 h 30 min', emphasis: false });
  });

  it('destaca o pré-aviso', () => {
    const status = { ...baseStatus, breakPhase: 'preWarning' as const, timeUntilBreakReminder: minutes(15) };
    expect(breakMessage(status, minutes(15))).toEqual({
      text: 'Pausa em 15 min. Planeje uma parada.',
      emphasis: true,
    });
  });

  it('destaca a pausa vencida com a pausa mínima do perfil', () => {
    const status = { ...baseStatus, breakPhase: 'overdue' as const, timeUntilBreakReminder: 0 };
    expect(breakMessage(status, minutes(30))).toEqual({
      text: 'Pausa vencida. Pare e descanse 30 min.',
      emphasis: true,
    });
  });
});

describe('RF05 - textos das verificações', () => {
  it('mostra quanto falta para a próxima verificação', () => {
    expect(checkMessage(baseStatus)).toBe('Próxima em 10 min');
  });

  it('explica que só há verificação em movimento', () => {
    expect(checkMessage({ ...baseStatus, checkPhase: 'waitingForMovement', timeUntilNextCheck: null })).toBe(
      'Só com o veículo em movimento',
    );
  });

  it('indica a verificação em andamento', () => {
    expect(checkMessage({ ...baseStatus, checkPhase: 'active', timeUntilNextCheck: null })).toBe('Em andamento');
  });

  it('mostra o intervalo diurno sem motivo', () => {
    expect(intervalMessage({ interval: minutes(15), reasons: [] })).toBe('A cada 15 min');
  });

  it('mostra os motivos do intervalo reduzido', () => {
    expect(intervalMessage({ interval: minutes(5), reasons: ['night', 'breakOverdue'] })).toBe(
      'A cada 5 min (madrugada, pausa vencida)',
    );
  });
});
