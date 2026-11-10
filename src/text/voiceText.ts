import type { VoiceReadiness } from '../services/response/voiceResponse';

export interface VoiceMessage {
  text: string;
  emphasis: boolean;
}

export function voiceMessage(readiness: VoiceReadiness): VoiceMessage | null {
  switch (readiness) {
    case 'unknown':
      return null;
    case 'preparing':
      return { text: 'Preparando a resposta por voz…', emphasis: false };
    case 'ready':
      return { text: 'Resposta por voz pronta: no alerta, diga “estou bem” ou “ok”.', emphasis: false };
    case 'denied':
      return {
        text: 'Sem permissão do microfone. No alerta, responda pelo toque com o veículo parado.',
        emphasis: true,
      };
    case 'unsupported':
      return {
        text: 'Este celular não reconhece voz sem internet. No alerta, responda pelo toque com o veículo parado.',
        emphasis: true,
      };
  }
}
