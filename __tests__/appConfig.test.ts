import { describe, expect, it } from '@jest/globals';

import appConfig from '../app.json';

describe('Configuração do app', () => {
  it('exibe o nome Alert-Drive', () => {
    expect(appConfig.expo.name).toBe('Alert-Drive');
  });

  it('usa o slug alert-drive', () => {
    expect(appConfig.expo.slug).toBe('alert-drive');
  });

  it('acompanha o tema claro ou escuro do sistema', () => {
    expect(appConfig.expo.userInterfaceStyle).toBe('automatic');
  });
});
