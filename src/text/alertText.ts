import type { ActiveAlertView } from '../core/alertView';
import { ALERT_MESSAGE, type AlertStage } from '../core/escalation';

export const TOUCH_RESPONSE_LABEL = 'Estou bem';

export const ALERT_SCREEN_MESSAGES: Readonly<Record<AlertStage, string>> = {
  check: 'Verificação de atenção. Você está bem?',
  preventive: 'Atenção. Responda à verificação.',
  mandatory: ALERT_MESSAGE,
  maximum: ALERT_MESSAGE,
};

export function responseInstruction(view: ActiveAlertView): string {
  if (view.touchAllowed && view.handsFreeAvailable) {
    return 'Diga “estou bem” ou toque no botão.';
  }
  if (view.touchAllowed) {
    return 'Toque no botão para responder.';
  }
  if (view.handsFreeAvailable) {
    return 'Diga “estou bem” ou “ok”.';
  }
  return 'Pare em local seguro para responder pelo toque.';
}
