# Oh My TabNews

Extensão de navegador com funcionalidades complementares para power users do [TabNews](https://www.tabnews.com.br). O vocabulário do projeto está em [CONTEXT.md](./CONTEXT.md) e as decisões de arquitetura em [docs/adr/](./docs/adr/).

## Features

### 🎬 Modo Reels

Percorra o feed um Conteúdo por vez, em tela cheia, na ordem exata do site até acabar — sem algoritmo próprio. Estilo TikTok, com swipe nativo de trackpad (scroll-snap).

- Capa com título e metadados; clique abre a **Leitura** com o corpo completo renderizado no dialeto de markdown do site
- Comentários em **Threads** estilo Slack: um nível por vez, sempre indicando a quem se responde
- **Voto** (tabcoins) em Conteúdos e Comentários, usando sua sessão do TabNews
- **Lidos**: avançar marca como lido; reabrir pula o que você já viu (estado local, "limpar" nas opções)
- No feed de **Recentes**, escolha um recorte — últimas 24 horas, 7 ou 30 dias — e chegue ao fim de verdade
- Atalhos: `Alt+R` abre/fecha, `j`/`k` ou setas navegam, `Enter` abre a Leitura, `Esc` volta um nível

_Mais features virão — a ideia é colecionar melhorias que talvez não sirvam ao público geral do site, mas fazem diferença pra quem vive nele._

## Desenvolvimento

```sh
npm install
npm run dev          # Chrome
npm run dev:firefox  # Firefox
```

`npm run build` gera a extensão em `.output/`.

## Estrutura

- `entrypoints/reels.content/` — content script do Modo Reels (FAB + overlay em Shadow DOM)
- `entrypoints/options/` — página de opções (toggles de Feature Modules, limpar Lidos)
- `entrypoints/background.ts` — encaminha o atalho Alt+R para a aba ativa
- `utils/` — registro de Feature Modules e estado do Modo Reels
