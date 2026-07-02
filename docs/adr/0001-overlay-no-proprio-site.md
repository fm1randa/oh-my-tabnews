# 0001 — Modo Reels vive num Overlay injetado no próprio site

## Status

Aceito (2026-07-01)

## Contexto

O Modo Reels precisa viver em algum lugar. As alternativas consideradas:

1. **Overlay no próprio tabnews.com.br** — content script injeta um botão nas páginas de lista que abre a visualização por cima da página.
2. **Página própria da extensão** (`chrome-extension://…/reels.html`) — liberdade total de layout, sem risco de conflito de CSS.
3. **Substituição in-place da lista** — remover o DOM da lista do site e renderizar o reels no lugar.

## Decisão

Overlay no próprio site (opção 1).

## Consequências

- Requisições à API do TabNews saem same-origin: a sessão do usuário (cookies) funciona de graça para ações autenticadas como votar, sem tratar cookies cross-origin nem permissões extras.
- A experiência parece uma feature nativa, alinhada à visão do projeto de que as features poderiam um dia virar built-in.
- O overlay deve isolar seus estilos (ex.: Shadow DOM) para não conflitar com o CSS do site nem ser afetado por ele.
- Diferente da substituição in-place, o overlay não depende da estrutura interna do DOM/hydration do Next.js do TabNews — só precisa de um ponto de ancoragem para o botão de entrada, reduzindo a superfície de quebra quando o site mudar.
