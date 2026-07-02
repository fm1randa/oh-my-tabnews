# Lido = avançar além da capa, não abrir a Leitura

No Modo Reels, um Conteúdo vira **Lido** quando o usuário avança além do seu Reel (capa) — abrir a Leitura não é exigido. Passar reto é uma decisão de pular, e é o que torna útil o comportamento de reabertura: recomeçar do topo do Feed pulando os já Lidos. O Reel em exibição no momento em que o overlay é fechado permanece não lido, então reabrir devolve o usuário exatamente onde parou. "Marcar como não lido" existe como válvula de escape.

## Considered Options

- **Lido = abrir a Leitura**: mais fiel à palavra "lido", mas as capas apenas espiadas reapareceriam em toda visita — o pulo de lidos quase não pularia nada para quem faz triagem rápida.
- **Dois estados (Visto e Lido)**: máxima precisão, mas dois estados para explicar, persistir e expor na UI — complexidade que a v1 não paga.

## Consequences

- O estado Lido é persistido em `storage.local`, por máquina, sem sincronização (quota de `storage.sync` não comporta um conjunto que cresce indefinidamente; o formato deve permitir um sync futuro).
- O pulo de Lidos é filtragem client-side sobre a paginação do Feed — a API do TabNews não conhece esse estado.
