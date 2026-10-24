import { describe, expect, it, jest } from '@jest/globals';

import appConfig from '../app.json';

type SplashOptions = { image: string; imageWidth: number; backgroundColor: string };

function findSplashOptions(): SplashOptions | undefined {
  const splashEntry = appConfig.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
  );
  return Array.isArray(splashEntry) ? (splashEntry[1] as SplashOptions) : undefined;
}

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

describe('Identidade visual', () => {
  it('usa o ícone preto do Alert-Drive como ícone principal', () => {
    expect(appConfig.expo.icon).toBe('./assets/images/alert-drive_preto_icone_app_1024.png');
  });

  it('usa fundo preto no ícone adaptativo do Android', () => {
    expect(appConfig.expo.android.adaptiveIcon.backgroundColor).toBe('#000000');
  });

  it('mostra o logo arredondado preto sobre fundo preto na tela de abertura', () => {
    expect(findSplashOptions()).toEqual({
      image: './assets/images/alert-drive_preto_arredondado_1024.png',
      imageWidth: 150,
      backgroundColor: '#000000',
    });
  });

  it('aponta só para imagens que existem no projeto', () => {
    const referencedImages = [
      appConfig.expo.icon,
      appConfig.expo.android.adaptiveIcon.foregroundImage,
      appConfig.expo.web.favicon,
      findSplashOptions()?.image ?? '',
    ];
    for (const imagePath of referencedImages) {
      expect(() => jest.requireActual(`../${imagePath}`)).not.toThrow();
    }
  });
});
