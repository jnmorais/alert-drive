export const SCREEN_TITLES = {
  profile: 'Alert-Drive',
  trip: 'Viagem',
  alert: 'Alerta',
  settings: 'Configurações',
  history: 'Histórico',
  simulation: 'Simulação',
} as const;

export type ScreenName = keyof typeof SCREEN_TITLES;
