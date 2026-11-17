# Alert-Drive

Protótipo de aplicativo móvel que alerta o motorista sobre fadiga, com parâmetros diferentes por tipo de veículo: caminhão, ônibus e automóvel.

Trabalho de Conclusão de Curso de **Jean de Souza Morais**, curso de Sistemas de Informação do Centro Universitário Academia (UniAcademia), Juiz de Fora/MG. Orientador: **Romualdo Monteiro de Resende Costa**.

## Como funciona

Durante a viagem, o app acompanha o tempo de direção pelo GPS e faz verificações periódicas. Em cada verificação, o motorista tem 15 segundos para responder. Se não responder, o alerta sobe em três etapas (preventiva, obrigatória e máxima), com som, vibração, mensagem de voz e sinal visual cada vez mais intensos.

O app também lembra o motorista de fazer pausas, respeitando os tetos legais de tempo de direção de cada perfil.

### Perfis e valores padrão

| Parâmetro | Caminhão | Ônibus | Automóvel |
|---|---|---|---|
| Lembrete de pausa (tempo de direção acumulado) | 5h30 | 4h | 2h |
| Pausa mínima reconhecida | 30 min | 30 min | 15 min |
| Pré-aviso de pausa | 30 min antes | 30 min antes | 15 min antes |
| Intervalo de verificação (diurno) | 10 min | 10 min | 15 min |
| Intervalo de verificação (00h–06h ou pausa vencida) | 5 min | 5 min | 5 min |
| Janela de resposta | 15 s | 15 s | 15 s |
| Duração de cada etapa de escalonamento | 15 s | 10 s | 15 s |

## Limites do protótipo

- O app **não mede sonolência real**. A "fadiga" é simulada pela ausência de resposta do motorista a uma verificação periódica.
- Os testes são feitos por **simulação com dados fictícios**. O projeto não exige nem incentiva testes com motorista real dirigindo.
- **Sem dados biométricos**: não usa câmera nem reconhecimento facial. Todos os dados ficam só no aparelho, sem envio para servidor.
- Com o veículo em movimento, o motorista **não precisa tocar no celular** (CTB, art. 252, parágrafo único). Ele responde dizendo "estou bem" ou "ok", com o reconhecimento de voz feito no próprio aparelho. A resposta por toque só é aceita com o veículo parado ou no modo simulação.
- Funciona sem internet.

## Tecnologias

- [Expo](https://expo.dev) SDK 58 com React Native 0.88
- TypeScript 6 em modo strict
- Jest com `jest-expo` para os testes
- ESLint com `eslint-config-expo` e regras próprias do projeto
- Bibliotecas do Expo para GPS, áudio, mensagem de voz, banco local (SQLite), tela ligada e compartilhamento de arquivos
- `expo-speech-recognition` para o reconhecimento de voz no aparelho
- [EAS Build](https://expo.dev/eas) para gerar o aplicativo Android
- Plataforma-alvo: Android

## Como rodar

Pré-requisitos: Node.js 24 e npm. Para gerar o aplicativo, é preciso uma conta Expo com acesso ao projeto no EAS.

O app completo, com a resposta por voz, precisa ser instalado como aplicativo próprio, gerado pelo EAS Build. O **Expo Go não serve**: ele não inclui o módulo nativo de reconhecimento de voz.

Há duas formas de instalar.

**APK preview:** o app fica instalado sozinho no celular, sem depender do computador.

```bash
npm install
npx eas-cli@27.6.0 login
npx eas-cli@27.6.0 build --profile preview --platform android
```

Ao final, o EAS mostra um link e um QR code para baixar o APK no celular.

**Development build:** para desenvolver, com o código carregado do computador.

```bash
npm install
npx eas-cli@27.6.0 login
npm run build:dev
```

Instale o APK gerado no celular e, depois, inicie o servidor:

```bash
npm run start:dev
```

Abra o app instalado e leia o QR code exibido no terminal. Se o computador e o celular estiverem em redes diferentes (por exemplo, computador no cabo e celular no Wi-Fi), use o túnel:

```bash
npm run start:dev:tunnel
```

## Reproduzindo os testes

### Testes automáticos

```bash
npm install
npm test
npm run test:coverage
```

Resultado esperado na versão atual:

- 59 suítes de teste e 698 testes, todos aprovados;
- 100% de cobertura em `src/core/`, a lógica de decisão do alerta.

O `npm run test:coverage` falha se a cobertura de `src/core/` ficar abaixo de 100%.

Os seis cenários de simulação também fazem parte desses testes. Eles rodam nos três perfis, com o resultado esperado de cada um.

### Cenários de simulação no app

| Cenário | Situação simulada |
|---|---|
| S1 | Motorista responde sempre rápido |
| S2 | Motorista para de responder |
| S3 | Viagem longa sem pausa |
| S4 | Pausa válida e pausa curta demais |
| S5 | Viagem de madrugada |
| S6 | Dois episódios seguidos na etapa 2 ou acima |

**Todos de uma vez:**

1. Na tela inicial, toque em **Simulação**.
2. Em **Cenários automáticos**, toque em **Rodar os 6 cenários nos 3 perfis**.
3. O app roda as 18 combinações com os valores padrão de cada perfil e as respostas do roteiro, e mostra **Aprovado** ou **Reprovado** para cada uma.
4. Toque em **Ver relatório completo** para ver os detalhes, ou em **Exportar relatório (CSV)** ou **Exportar resumo (texto)** para salvar o resultado.

**Um cenário por vez, acompanhando na tela:**

1. Na tela inicial, escolha o perfil: caminhão, ônibus ou automóvel.
2. Toque em **Simulação** e escolha o roteiro, de S1 a S6.
3. Escolha a aceleração (por exemplo, `60×`, em que 1 s real equivale a 1 min simulado).
4. Em **Respostas**, escolha **Do roteiro** para que as respostas sigam o cenário, ou **Pelo toque** para responder você mesmo.
5. Toque em **Iniciar simulação** e acompanhe pela tela da viagem e pela tela de alerta.
6. Ao fim, encerre a viagem. Ela aparece em **Histórico**, de onde pode ser exportada em CSV.

Repita para os outros perfis e roteiros.

## Scripts

| Comando | O que faz |
|---|---|
| `npm start` | Inicia o servidor de desenvolvimento do Expo |
| `npm run start:tunnel` | Inicia o Expo por túnel, para celular em outra rede |
| `npm run start:dev` | Inicia o servidor para o development build |
| `npm run start:dev:tunnel` | Inicia o servidor para o development build por túnel |
| `npm run build:dev` | Gera o development build Android no EAS |
| `npm run android` | Inicia o Expo e abre no Android |
| `npm run web` | Inicia a versão web, usada só para conferência visual das telas |
| `npm run web:export` | Gera a versão web em `dist/` |
| `npm test` | Roda os testes com Jest |
| `npm run test:coverage` | Roda os testes e gera o relatório de cobertura |
| `npm run lint` | Verifica o código com ESLint |
| `npm run typecheck` | Verifica os tipos com o TypeScript |
| `npm run generate:tones` | Gera os tons de alerta em `assets/sounds/` e confere as frequências |

## Estrutura

```
__tests__/          teste da configuração do app (ícones e tela de abertura)
assets/
  images/           ícones e logo
  sounds/           tons de alerta em WAV
scripts/            gerador dos tons de alerta e seu teste
src/
  app/              rotas do Expo Router (uma por tela)
  components/       componentes de interface reutilizados pelas telas
  core/             lógica de decisão em funções puras, sem React nem Expo
  screens/          telas: Perfil, Viagem, Alerta, Configurações, Histórico e Simulação
  services/         adaptadores para GPS, áudio, vibração, voz e tela ligada
    database/       abertura do banco SQLite e migrações
    eventLog/       registro das viagens e exportação em CSV
    preferences/    preferências salvas no aparelho
    response/       formas de o motorista responder: toque e voz
  simulation/       relógio acelerado, cenários fictícios e relatórios
  state/            estado global da viagem e ligação com os serviços
  testing/          apoio aos testes (banco SQLite em memória)
  text/             textos da interface e formatação
  theme/            cores, tipografia e tema claro/escuro
```
