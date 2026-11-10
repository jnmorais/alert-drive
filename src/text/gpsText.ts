import type { GpsStatus } from '../state/gpsTracker';

export interface GpsMessage {
  text: string;
  emphasis: boolean;
}

export function gpsMessage(status: GpsStatus): GpsMessage | null {
  switch (status.state) {
    case 'inactive':
      return null;
    case 'requesting':
      return { text: 'GPS: pedindo permissão de localização…', emphasis: false };
    case 'waiting':
      return { text: 'GPS: aguardando sinal…', emphasis: false };
    case 'tracking':
      return { text: `GPS: ${Math.round(status.speedKmh)} km/h`, emphasis: false };
    case 'denied':
      return { text: 'Sem permissão de localização. O tempo de direção não está sendo contado.', emphasis: true };
    case 'servicesOff':
      return { text: 'Localização desligada. Ligue o GPS para contar o tempo de direção.', emphasis: true };
    case 'error':
      return { text: 'Não foi possível ler o GPS. O tempo de direção não está sendo contado.', emphasis: true };
  }
}
