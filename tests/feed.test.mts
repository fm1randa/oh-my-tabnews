import { FeedEngine } from '../entrypoints/reels.content/feed';
import type { ContentSummary } from '../utils/api';

function makeItem(i: number, publishedAt: string, type = 'content'): ContentSummary {
  return {
    id: `id-${i}`,
    title: `Post ${i}`,
    slug: `post-${i}`,
    owner_username: 'user',
    tabcoins: 1,
    children_deep_count: 0,
    published_at: publishedAt,
    source_url: null,
    type,
  };
}

function pagesOf(items: ContentSummary[], perPage = 100) {
  const pages: ContentSummary[][] = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages;
}

let failures = 0;
function assert(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures++;
}

const NOW = Date.parse('2026-07-01T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

// --- Cenário 1: Relevantes finito (127 itens), sem lidos ---
{
  const items = Array.from({ length: 127 }, (_, i) => makeItem(i, hoursAgo(i * 0.1)));
  const pages = pagesOf(items);
  const engine = new FeedEngine({
    strategy: 'relevant',
    isRead: () => false,
    fetchPage: async (_s, page) => pages[page - 1] ?? [],
    delayBetweenPagesMs: 0,
  });
  await engine.ensure(3);
  assert(engine.items.length === 100 && engine.status === 'idle', 'relevant: primeira página preenche buffer');
  await engine.ensure(130);
  assert(engine.items.length === 127, 'relevant: todos os 127 itens carregados');
  assert(engine.status === 'feed-end', 'relevant: fim do feed detectado (página vazia)');
}

// --- Cenário 2: tudo lido → stalled com teto de 5 páginas ---
{
  const items = Array.from({ length: 1100 }, (_, i) => makeItem(i, hoursAgo(i * 0.01)));
  const pages = pagesOf(items);
  let fetched = 0;
  const engine = new FeedEngine({
    strategy: 'relevant',
    isRead: () => true,
    fetchPage: async (_s, page) => {
      fetched++;
      return pages[page - 1] ?? [];
    },
    delayBetweenPagesMs: 0,
  });
  await engine.ensure(3);
  assert(engine.status === 'stalled' && fetched === 5, `stalled após 5 páginas (fetched=${fetched})`);
  assert(engine.scannedSinceLastHit === 500, `contador de varridos = 500 (${engine.scannedSinceLastHit})`);
  await engine.continueScanning(3);
  assert(fetched === 10 && engine.status === 'stalled', 'continuar varre mais 5 páginas');
}

// --- Cenário 3: Recentes com Período — corte, overflow re-filtrado e estender ---
{
  // 60 itens nas últimas 24h, 90 na faixa 24h–7d, 51 na faixa 7d–30d
  const recent = Array.from({ length: 60 }, (_, i) => makeItem(i, hoursAgo(i * 0.4)));
  const older = Array.from({ length: 90 }, (_, i) => makeItem(100 + i, hoursAgo(25 + i)));
  const oldest = Array.from({ length: 51 }, (_, i) => makeItem(300 + i, hoursAgo(200 + i)));
  const pages = pagesOf([...recent, ...older, ...oldest]);
  const cutoff = (h: number) => new Date(NOW - h * 3600_000).toISOString();
  const engine = new FeedEngine({
    strategy: 'new',
    cutoffISO: cutoff(24),
    isRead: () => false,
    fetchPage: async (_s, page) => pages[page - 1] ?? [],
    delayBetweenPagesMs: 0,
  });
  await engine.ensure(400);
  assert(engine.items.length === 60, `período 24h: só itens na janela (${engine.items.length})`);
  assert(engine.status === 'period-end', 'período 24h: period-end detectado');
  engine.extendPeriod(cutoff(7 * 24));
  await engine.ensure(400);
  assert(engine.items.length === 150, `estendido 7d: NÃO inclui itens de 30d (${engine.items.length})`);
  assert(engine.status === 'period-end', `estendido 7d: period-end de novo (${engine.status})`);
  engine.extendPeriod(cutoff(30 * 24));
  await engine.ensure(400);
  assert(engine.items.length === 201, `estendido 30d: tudo dentro (${engine.items.length})`);
  assert(engine.status === 'feed-end', `estendido 30d: feed-end (${engine.status})`);
  const order = engine.items.every((item, i) => i === 0 || engine.items[i - 1].published_at >= item.published_at);
  assert(order, 'ordem cronológica preservada após estender');
}

// --- Cenário 4: anúncios e duplicatas filtrados ---
{
  const list = [makeItem(1, hoursAgo(1)), makeItem(2, hoursAgo(2), 'ad'), makeItem(1, hoursAgo(1)), makeItem(3, hoursAgo(3))];
  const engine = new FeedEngine({
    strategy: 'relevant',
    isRead: () => false,
    fetchPage: async (_s, page) => (page === 1 ? list : []),
    delayBetweenPagesMs: 0,
  });
  await engine.ensure(10);
  assert(engine.items.length === 2, `ads e duplicatas fora (${engine.items.length})`);
}

// --- Cenário 5: erro de rede → status error e retry ---
{
  let calls = 0;
  const engine = new FeedEngine({
    strategy: 'relevant',
    isRead: () => false,
    fetchPage: async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
      return calls === 2 ? [makeItem(1, hoursAgo(1))] : [];
    },
    delayBetweenPagesMs: 0,
  });
  await engine.ensure(1);
  assert(engine.status === 'error' && engine.errorMessage === 'boom', 'erro exposto');
  await engine.ensure(1);
  assert(engine.items.length === 1, 'retry recupera');
}

process.exit(failures ? 1 : 0);
