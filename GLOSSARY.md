# Oh My TabNews

Extensão de navegador que adiciona funcionalidades complementares ao TabNews (tabnews.com.br) para power users — features que talvez não sirvam ao público geral do site, mas que poderiam um dia virar built-in.

## Language

**Conteúdo**:
Uma publicação raiz do TabNews (post/artigo), como o próprio site a chama.
_Avoid_: artigo, post, publicação

**Feed**:
Uma lista ordenada de Conteúdos segundo uma estratégia nativa do site (Relevantes ou Recentes).
_Avoid_: lista, timeline, algoritmo

**Modo Reels**:
Visualização imersiva que apresenta um Conteúdo por vez, avançando na ordem exata do Feed até o fim.
_Avoid_: tiktok view, swipe mode, stories

**Reel**:
A capa de um Conteúdo em tela cheia dentro do Modo Reels: apenas título e metadados (autor, tabcoins, comentários, idade), no estilo do app Tabs.
_Avoid_: card, slide

**Leitura**:
A visão expandida de um Reel, com o corpo completo do Conteúdo e seus Comentários, carregada sob demanda ao abri-lo.
_Avoid_: preview, detalhe, modal de conteúdo

**Comentário**:
Um Conteúdo filho (tem `parent_id`), resposta a um Conteúdo raiz ou a outro Comentário.
_Avoid_: resposta, reply, child

**Thread**:
A visão das respostas diretas a um único Conteúdo, um nível por vez (estilo Slack): abrir a Thread de um Comentário mostra só as respostas dele, sempre com um cabeçalho indicando a quem se responde ("Respostas a {autor}: {trecho}").
_Avoid_: árvore de comentários, subcomentários aninhados

**Overlay**:
Camada em tela cheia injetada por content script por cima das páginas do tabnews.com.br, herdando a sessão do usuário.
_Avoid_: popup, modal, página da extensão

**Feature Module**:
Unidade auto-contida de funcionalidade da extensão, ativável/desativável individualmente pelo usuário.
_Avoid_: plugin, addon

**Período**:
Janela rolante escolhida ao entrar no Modo Reels pelo feed de Recentes, que define onde o Feed termina: últimas 24 horas, últimos 7 dias ou últimos 30 dias.
_Avoid_: filtro de data, range, hoje/semana/mês civis

**Lido**:
Estado persistente de um Conteúdo cujo Reel foi exibido e do qual o usuário avançou; abrir a Leitura não é exigido, e o usuário pode desfazer ("marcar como não lido").
_Avoid_: visto, visualizado, consumido

## Relationships

- A **Extensão** é composta por um ou mais **Feature Modules**
- O **Modo Reels** é um **Feature Module** e vive dentro de um **Overlay**
- O **Modo Reels** percorre exatamente um **Feed**, na ordem do site, sem reordenação própria
- Um **Reel** apresenta exatamente um **Conteúdo**; abrir um **Reel** leva à sua **Leitura**
- A **Leitura** busca o corpo do **Conteúdo** apenas quando aberta (nenhum prefetch de corpo no **Feed**)
- A **Leitura** mostra os **Comentários** diretos do **Conteúdo**; cada **Comentário** com respostas abre sua própria **Thread**
- Uma **Thread** mostra apenas um nível de profundidade; descer mais um nível abre outra **Thread**, nunca uma árvore aninhada
- Avançar além de um **Reel** marca seu **Conteúdo** como **Lido**; o Reel em exibição ao fechar o overlay permanece não lido
- Ao reabrir, o **Modo Reels** recomeça do topo do **Feed** pulando os **Conteúdos** já **Lidos**
- O **Feed** de Recentes exige um **Período**; o **Feed** de Relevantes não (ele já é finito por natureza)
- Todo **Feed** no **Modo Reels** tem fim: Relevantes acaba quando a lista ranqueada acaba, Recentes acaba no corte do **Período**

## Example dialogue

> **Dev:** "Quando o usuário abre o **Modo Reels**, a gente reordena os **Conteúdos** por engajamento?"
> **Domain expert:** "Nunca. O **Modo Reels** não tem algoritmo — ele percorre o **Feed** na ordem exata em que o site o entrega, página após página, até acabar."

## Flagged ambiguities

- "artigo" foi usado para se referir às publicações — resolvido: o termo canônico é **Conteúdo**, seguindo a nomenclatura do próprio TabNews (`type: content` na API).
- "sem algoritmo" não significa ordem cronológica — significa que a extensão não reordena nada; a ordem é a do **Feed** escolhido (Relevantes tem ranking, mas o ranking é do site, não da extensão).
