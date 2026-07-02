import { storage } from '#imports';

// Estado Lido: id do Conteúdo → instante em que foi lido (ISO 8601).
// Local por máquina, sem poda na v1; readAt existe para viabilizar poda/sync futuros (ADR 0002).
export const readContents = storage.defineItem<Record<string, string>>('local:reels:read', {
  fallback: {},
});
