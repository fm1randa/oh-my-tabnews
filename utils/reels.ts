import { storage } from '#imports';

// Estado Lido: id do Conteúdo → instante em que foi lido (ISO 8601).
// Local por máquina, sem poda na v1; readAt existe para viabilizar poda/sync futuros (ADR 0002).
export const readContents = storage.defineItem<Record<string, string>>('local:reels:read', {
  fallback: {},
});

// Período: janela rolante do feed de Recentes (ADR 0004).
export type PeriodId = '24h' | '7d' | '30d';

export const PERIODS: Array<{ id: PeriodId; label: string; ms: number }> = [
  { id: '24h', label: 'Últimas 24 horas', ms: 24 * 60 * 60 * 1000 },
  { id: '7d', label: 'Últimos 7 dias', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: 'Últimos 30 dias', ms: 30 * 24 * 60 * 60 * 1000 },
];

export const lastPeriod = storage.defineItem<PeriodId>('local:reels:lastPeriod', {
  fallback: '24h',
});

export function periodCutoff(id: PeriodId, now = Date.now()): string {
  const period = PERIODS.find((p) => p.id === id)!;
  return new Date(now - period.ms).toISOString();
}
