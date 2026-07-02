# Nenhum Feed é infinito: Recentes exige um Período

Rejeitamos deliberadamente o padrão de feed infinito. Todo Feed no Modo Reels tem um fim alcançável — a experiência é "top down até acabar", não consumo sem fundo.

Relevantes já é finito por natureza: o ranking do site (confirmado em `queries/rankingQueries.js` do repositório tabnews.com.br) só considera Conteúdos dos últimos ~7 dias com `tabcoins > 0` — a lista inteira tem na ordem de ~100–150 itens. Recentes, porém, é efetivamente sem fim; por isso, entrar por ele exige escolher um **Período** — janela rolante de 24 horas, 7 dias ou 30 dias (não calendário civil, para a quantidade de Conteúdo ser consistente em qualquer hora do dia). O corte do Período é o fim do Feed; a tela de fim oferece estender a janela, o que mantém o controle explícito nas mãos do usuário.

## Consequences

- O corte do Período também limita a varredura de páginas ao pular Lidos — junto com rajadas com teto, é o que protege do rate limit da API.
- "Auto-estender" ao chegar no corte foi rejeitado: violaria a promessa do Período e reintroduziria o feed infinito pela porta dos fundos.
