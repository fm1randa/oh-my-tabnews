# Fatos verificados da API/código do TabNews

Verificados em 2026-07-01 contra o código-fonte de `filipedeschamps/tabnews.com.br` (main) e a API ao vivo. Referências de caminho são do repositório do site.

## Listagem de Feed

- `GET /api/v1/contents?strategy=new|relevant&page=N&per_page=M` — só metadados, **sem corpo**.
- `per_page`: mínimo 1, máximo **100**, default 30 (`models/validator.js`).
- Relevantes é finito: o ranking (`queries/rankingQueries.js`) só considera Conteúdos dos últimos ~7 dias com `tabcoins > 0` (ou com interação nas últimas 24h) — ~100–150 itens no total. Fim empírico confirmado ao vivo: página além do fim retorna `[]`.
- Recentes (`strategy=new`) é ordenado por `published_at DESC` — o corte do Período é detectável no cliente ao cruzar a data.
- Não há rate limit aplicacional em GET no código aberto (o firewall só guarda `create:user` e `create:content`); proteção de borda (Vercel) pode existir — manter as rajadas com teto por cortesia.

## Corpo e comentários

- `GET /api/v1/contents/{user}/{slug}` — Conteúdo completo com `body` (markdown).
- `GET /api/v1/contents/{user}/{slug}/children` — devolve a **árvore aninhada completa** da discussão (cada nó tem `body`, `tabcoins`, `owner_username`, `children[]`). Uma request por Leitura; Threads são fatiamento client-side.

## Markdown

- O site renderiza com ByteMD + plugins (visto em `@tabnews/ui` → `src/Markdown/Markdown.jsx`): `gfm` (locale pt-BR), `breaks`, `gemoji`, `highlight-ssr`, `math`, `mermaid`, mais `rehype-slug`/`rehype-external-links` e plugins próprios (âncoras, copiar código, clobber prefix).
- **Não** usar `@tabnews/ui` diretamente: peer deps de Next ≥15 e React 18 (conflita com React 19 sem Next) e arrasta `@primer/react` + styled-components v5. Usar o core vanilla do ByteMD com o mesmo conjunto de plugins (math/mermaid com lazy-load).

## Voto (tabcoins)

- `POST /api/v1/contents/{user}/{slug}/tabcoins` com body `{ "transaction_type": "credit" | "debit" }`.
- Autenticação: **só cookie de sessão** (`injectAnonymousOrUser`) — nenhum token CSRF na cadeia do endpoint; fetch same-origin do content script funciona.
- Regras que a UI precisa tratar:
  - Cada voto **debita 2 TabCoins do votante** (saldo insuficiente → erro).
  - Não pode votar no próprio Conteúdo (422).
  - Máximo de ~3 eventos de voto por Conteúdo por usuário/IP em 72h ("Você está tentando qualificar muitas vezes o mesmo conteúdo").
  - Exige feature `update:content` (usuário logado e ativo).
