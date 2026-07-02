import type { ContentSummary, FeedStrategy } from '@/utils/api';

// Motor de Feed do Modo Reels (ADR 0004): pagina sob demanda, filtra Lidos,
// para no corte do Período e varre em rajadas com teto para não abusar da API.

export type FeedStatus =
  | 'idle' // há itens suficientes no buffer
  | 'loading'
  | 'stalled' // rajada esgotada sem itens novos — aguardando "continuar?"
  | 'feed-end' // a lista do site acabou
  | 'period-end' // cruzamos o corte do Período
  | 'error';

export interface FeedEngineOptions {
  strategy: FeedStrategy;
  cutoffISO?: string | null; // exigido para strategy=new (Período)
  includeRead?: boolean; // modo "rever Lidos"
  isRead: (id: string) => boolean;
  fetchPage: (strategy: FeedStrategy, page: number) => Promise<ContentSummary[]>;
  pagesPerBurst?: number;
  delayBetweenPagesMs?: number;
}

export class FeedEngine {
  items: ContentSummary[] = [];
  status: FeedStatus = 'idle';
  errorMessage: string | null = null;
  scannedSinceLastHit = 0;

  private page = 0;
  private overflow: ContentSummary[] = []; // itens além do corte, guardados para "estender Período"
  private seen = new Set<string>();
  private pagesPerBurst: number;
  private delayMs: number;
  private fetching: Promise<void> | null = null;

  constructor(private options: FeedEngineOptions) {
    this.pagesPerBurst = options.pagesPerBurst ?? 5;
    this.delayMs = options.delayBetweenPagesMs ?? 300;
  }

  get includeRead() {
    return this.options.includeRead ?? false;
  }

  /** Garante `count` itens no buffer, respeitando o teto da rajada. */
  async ensure(count: number): Promise<void> {
    if (this.fetching) {
      await this.fetching;
      return;
    }
    if (this.items.length >= count || this.isExhausted() || this.status === 'stalled') return;

    this.fetching = this.runBurst(count);
    try {
      await this.fetching;
    } finally {
      this.fetching = null;
    }
  }

  /** Retoma a varredura depois de um "stalled" (usuário pediu pra continuar). */
  async continueScanning(count: number): Promise<void> {
    if (this.status === 'stalled') {
      this.status = 'idle';
      this.scannedSinceLastHit = 0;
    }
    await this.ensure(count);
  }

  /** Estende o Período: reaproveita o overflow e reabre a paginação. */
  extendPeriod(newCutoffISO: string) {
    this.options.cutoffISO = newCutoffISO;
    const rescued = this.overflow;
    this.overflow = [];
    for (const item of rescued) this.accept(item);
    if (this.status === 'period-end') this.status = 'idle';
  }

  private isExhausted() {
    return this.status === 'feed-end' || this.status === 'period-end';
  }

  private async runBurst(count: number): Promise<void> {
    this.status = 'loading';
    this.errorMessage = null;
    let pagesFetched = 0;
    let hits = 0;

    while (this.items.length < count && pagesFetched < this.pagesPerBurst) {
      if (pagesFetched > 0) await sleep(this.delayMs);

      let pageItems: ContentSummary[];
      try {
        pageItems = await this.options.fetchPage(this.options.strategy, this.page + 1);
      } catch (error) {
        this.status = 'error';
        this.errorMessage = error instanceof Error ? error.message : String(error);
        return;
      }

      this.page += 1;
      pagesFetched += 1;

      if (pageItems.length === 0) {
        this.status = 'feed-end';
        return;
      }

      for (const item of pageItems) {
        if (this.options.cutoffISO && item.published_at < this.options.cutoffISO) {
          // Feed ordenado por data desc: daqui em diante é tudo mais antigo.
          if (this.acceptable(item)) this.overflow.push(item);
          continue;
        }
        this.scannedSinceLastHit += 1;
        if (this.accept(item)) {
          hits += 1;
          this.scannedSinceLastHit = 0;
        }
      }

      if (this.options.cutoffISO && pageItems[pageItems.length - 1].published_at < this.options.cutoffISO) {
        this.status = 'period-end';
        return;
      }
    }

    if (this.items.length >= count) {
      this.status = 'idle';
    } else {
      // Teto da rajada atingido sem completar o buffer.
      this.status = hits > 0 ? 'idle' : 'stalled';
    }
  }

  private acceptable(item: ContentSummary): boolean {
    if (item.type !== 'content') return false; // ignora anúncios
    if (this.seen.has(item.id)) return false;
    if (!this.includeRead && this.options.isRead(item.id)) return false;
    return true;
  }

  private accept(item: ContentSummary): boolean {
    if (!this.acceptable(item)) return false;
    this.seen.add(item.id);
    this.items.push(item);
    return true;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
