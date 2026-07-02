# Oh My TabNews

Extensão de navegador com funcionalidades complementares para power users do [TabNews](https://www.tabnews.com.br). O vocabulário do projeto está em [CONTEXT.md](./CONTEXT.md) e as decisões de arquitetura em [docs/adr/](./docs/adr/).

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
