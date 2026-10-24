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
- Com o veículo em movimento, o motorista **não precisa tocar no celular** (CTB, art. 252, parágrafo único). A resposta por toque só é aceita com o veículo parado ou no modo simulação.
- Funciona sem internet.

## Tecnologias

- [Expo](https://expo.dev) SDK 58 com React Native 0.88
- TypeScript 6 em modo strict
- Jest com `jest-expo` para os testes
- ESLint com `eslint-config-expo` e regras próprias do projeto
- Plataforma-alvo: Android

## Como rodar

Pré-requisitos: Node.js 24 e npm. Para abrir no celular, instale o app **Expo Go** no Android.

```bash
npm install
npm start
```

Leia o QR code exibido no terminal com o Expo Go. Se o computador e o celular estiverem em redes diferentes (por exemplo, computador no cabo e celular no Wi-Fi), use o túnel:

```bash
npm run start:tunnel
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm start` | Inicia o servidor de desenvolvimento do Expo |
| `npm run start:tunnel` | Inicia o Expo por túnel, para celular em outra rede |
| `npm run android` | Inicia o Expo e abre no Android |
| `npm test` | Roda os testes com Jest |
| `npm run test:coverage` | Roda os testes e gera o relatório de cobertura |
| `npm run lint` | Verifica o código com ESLint |
| `npm run typecheck` | Verifica os tipos com o TypeScript |

## Estrutura planejada

```
src/
  core/         lógica de decisão em funções puras, sem React nem Expo
  services/     adaptadores para GPS, áudio, vibração, voz e registro de eventos
  simulation/   relógio acelerado e cenários fictícios
  screens/      telas do app
  state/        estado global da viagem
```

## Andamento

| Fase | Conteúdo | Situação |
|---|---|---|
| 0 | Estrutura do projeto, ESLint e Jest | em andamento |
| 1 | Núcleo: perfis, tempo de direção, verificações, escalonamento e episódios recorrentes | pendente |
| 2 | Modo simulação e telas | pendente |
| 3 | Serviços do aparelho: GPS, áudio, vibração, voz e registro de eventos | pendente |
| 4 | Resposta sem toque: reconhecimento de voz | pendente |
| 5 | Testes do TCC com todos os cenários nos três perfis | pendente |
