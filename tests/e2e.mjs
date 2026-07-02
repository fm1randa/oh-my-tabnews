import { chromium } from 'playwright';

const EXT = new URL('../.output/chrome-mv3', import.meta.url).pathname;
const SHOT_DIR = new URL('./shots/', import.meta.url).pathname;
const results = [];
let page;

function ok(name, cond, extra = '') {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}${extra ? ` — ${extra}` : ''}`);
}

async function shot(name) {
  try {
    await page.screenshot({ path: `${SHOT_DIR}${name}.png` });
  } catch {}
}

// Um "gesto" de trackpad: rajada de eventos wheel próximos, depois silêncio.
async function gesture(totalDelta, steps = 10, stepGapMs = 25) {
  const step = totalDelta / steps;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, step);
    await page.waitForTimeout(stepGapMs);
  }
  await page.waitForTimeout(700); // fim do gesto + settle
}

// Flick intenso estilo trackpad do macOS: fase ativa forte, depois cauda de
// inércia realista — deltas decaindo monotonicamente com intervalos crescendo.
async function flickWithMomentum() {
  for (const d of [80, 140, 180, 200]) {
    await page.mouse.wheel(0, d);
    await page.waitForTimeout(15);
  }
  let d = 150;
  let gapMs = 30;
  while (d >= 5) {
    await page.mouse.wheel(0, d);
    await page.waitForTimeout(gapMs);
    d *= 0.72;
    gapMs = Math.min(gapMs * 1.3, 200);
  }
  await page.waitForTimeout(800); // fim de verdade
}

// Flick curto e forte, com cauda de inércia breve — para testar encadeamento.
async function quickFlick() {
  for (const d of [60, 120, 180, 200]) {
    await page.mouse.wheel(0, d);
    await page.waitForTimeout(15);
  }
  for (const d of [150, 110, 80, 55, 35, 20, 10]) {
    await page.mouse.wheel(0, d);
    await page.waitForTimeout(40);
  }
}

async function counter() {
  return (await page.locator('.omtn-slide:not([style*="top"]) .omtn-counter').first().textContent())?.trim();
}

// ---------------- Fixtures ----------------
const now = Date.now();
const iso = (hoursAgo) => new Date(now - hoursAgo * 3600_000).toISOString();

function item(i, publishedAt, extra = {}) {
  return {
    id: `id-${i}`,
    title: `Post de teste número ${i}`,
    slug: `post-${i}`,
    owner_username: 'tester',
    parent_id: null,
    tabcoins: 5,
    children_deep_count: 3,
    published_at: publishedAt,
    source_url: null,
    type: 'content',
    ...extra,
  };
}

// Relevantes: 9 itens → espaço pros testes de gesto, fim de feed alcançável.
const RELEVANT = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => item(i, iso(i)));
// Recentes: 3 nas últimas 24h, 2 na faixa 24h–7d, 2 na faixa 7d–30d.
const NEW = [
  item(101, iso(2)),
  item(102, iso(10)),
  item(103, iso(20)),
  item(104, iso(30)),
  item(105, iso(100)),
  item(106, iso(10 * 24)),
  item(107, iso(20 * 24)),
];

const BODY = `## Um título de seção

Texto do corpo com **negrito** e \`código inline\`.

\`\`\`js
const x = 1;
\`\`\`

Parágrafo final.`;

function comment(id, body, children = []) {
  return {
    id: `c-${id}`,
    parent_id: 'x',
    owner_username: `commenter${id}`,
    slug: `comment-${id}`,
    body,
    tabcoins: 1,
    children_deep_count: children.length,
    published_at: iso(1),
    children,
    type: 'content',
  };
}

const CHILDREN_TREE = [
  comment(1, 'Comentário raiz com **markdown**.', [
    comment(11, 'Resposta de primeiro nível.', [comment(111, 'Resposta de segundo nível (thread na thread).')]),
    comment(12, 'Outra resposta de primeiro nível.'),
  ]),
  comment(2, 'Segundo comentário raiz, sem respostas.'),
];

let votePosts = 0;

async function setupRoutes(context) {
  // Documento estéril no host do TabNews: o content script injeta normalmente.
  await context.route('https://www.tabnews.com.br/**', (route) => {
    if (route.request().resourceType() === 'document') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><head><title>stub</title></head><body><h1>stub tabnews</h1></body></html>',
      });
    }
    return route.fallback();
  });

  await context.route('https://www.tabnews.com.br/api/v1/contents**', (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname.replace('/api/v1/contents', '');

    if (method === 'POST' && path.endsWith('/tabcoins')) {
      votePosts++;
      if (votePosts === 1) {
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ tabcoins: 99 }) });
      }
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Usuário não pode executar esta operação.' }),
      });
    }

    if (path === '' || path === '/') {
      const strategy = url.searchParams.get('strategy');
      const pageN = Number(url.searchParams.get('page') ?? '1');
      const list = strategy === 'new' ? NEW : RELEVANT;
      const body = pageN === 1 ? list : [];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }

    if (path.endsWith('/children')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(CHILDREN_TREE) });
    }

    // Conteúdo completo
    const slug = path.split('/').pop();
    const all = [...RELEVANT, ...NEW];
    const found = all.find((i) => i.slug === slug) ?? RELEVANT[0];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...found, body: BODY }) });
  });
}

// ---------------- Suíte ----------------
const context = await chromium.launchPersistentContext('', {
  headless: true,
  channel: 'chromium',
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
await setupRoutes(context);

page = await context.newPage();
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

try {
  // ---------- FAB e abertura em Relevantes ----------
  await page.goto('https://www.tabnews.com.br/', { waitUntil: 'domcontentloaded' });
  const fab = page.locator('.omtn-fab');
  await fab.waitFor({ state: 'visible', timeout: 10000 });
  ok('FAB visível na home', await fab.isVisible());

  await fab.click();
  const title = page.locator('.omtn-slide:not([style*="top"]) .omtn-title');
  await title.waitFor({ state: 'visible', timeout: 10000 });
  ok('Relevantes abre sem picker', (await page.locator('.omtn-period-options').count()) === 0);
  ok('Capa #1 renderizada', (await counter()) === '#1', `counter=${await counter()}`);
  ok('FAB some com overlay aberto', (await fab.count()) === 0);
  await shot('01-reel');

  // ---------- Gestos ----------
  await page.mouse.move(640, 400);
  await gesture(600);
  ok('Gesto > 50% avança para #2', (await counter()) === '#2', `counter=${await counter()}`);

  await gesture(6000, 30, 20);
  ok('Gesto gigante contínuo avança só 1 → #3', (await counter()) === '#3', `counter=${await counter()}`);

  await gesture(150, 4);
  ok('Gesto lento < 50% não avança', (await counter()) === '#3', `counter=${await counter()}`);

  await flickWithMomentum();
  ok('Flick intenso com cauda de inércia avança só 1 → #4', (await counter()) === '#4', `counter=${await counter()}`);

  await quickFlick();
  await page.waitForTimeout(450);
  await quickFlick();
  await page.waitForTimeout(600);
  ok('Segundo flick logo após o primeiro responde (um Reel cada) → #6', (await counter()) === '#6', `counter=${await counter()}`);

  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('k');
    await page.waitForTimeout(500);
  }
  ok('Teclado volta três → #3', (await counter()) === '#3', `counter=${await counter()}`);

  await gesture(-600);
  ok('Gesto pra trás volta para #2', (await counter()) === '#2', `counter=${await counter()}`);

  ok('Reel revisitado mostra chip lido', (await page.locator('.omtn-chip').count()) > 0);

  // ---------- Regressões visuais dos slides vizinhos ----------
  const geometry = await page.evaluate(() => {
    const root = document.querySelector('oh-my-tabnews-reels').shadowRoot;
    const viewport = root.querySelector('.omtn-viewport').getBoundingClientRect();
    const slides = [...root.querySelectorAll('.omtn-slide')].map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - viewport.top, height: r.height };
    });
    const bylines = [...root.querySelectorAll('.omtn-byline')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= viewport.top - 1 && r.bottom <= viewport.bottom + 1;
    });
    return { viewportH: viewport.height, slides, visibleBylines: bylines.length };
  });
  ok(
    'Slides vizinhos têm exatamente a altura da tela (sem vazar rodapé)',
    geometry.slides.every((s) => Math.abs(s.height - geometry.viewportH) < 2),
    JSON.stringify(geometry.slides),
  );
  ok('Só um byline visível por vez (sem metadados acumulados)', geometry.visibleBylines === 1, `${geometry.visibleBylines} visíveis`);
  ok('Botões de navegação fora dos slides (não rolam junto)', (await page.locator('.omtn-slide .omtn-navbuttons').count()) === 0);
  ok('Botões de navegação presentes no overlay', (await page.locator('.omtn-overlay > .omtn-navbuttons').count()) === 1);


  // ---------- Teclado ----------
  await page.keyboard.press('j');
  await page.waitForTimeout(600);
  ok('Tecla j avança', (await counter()) === '#3', `counter=${await counter()}`);
  await page.keyboard.press('k');
  await page.waitForTimeout(600);
  ok('Tecla k volta', (await counter()) === '#2', `counter=${await counter()}`);

  // ---------- Marcar como não lido ----------
  const chipBefore = await page.locator('.omtn-chip').count();
  if (chipBefore > 0) {
    await page.locator('.omtn-slide:not([style*="top"]) .omtn-chip').click();
    await page.waitForTimeout(200);
    ok('Desfazer lido remove o chip', (await page.locator('.omtn-slide:not([style*="top"]) .omtn-chip').count()) === 0);
  }

  // ---------- Leitura ----------
  await page.locator('.omtn-slide:not([style*="top"]) .omtn-title').click();
  const reader = page.locator('.omtn-reader');
  await reader.waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('.omtn-reader .omtn-markdown').first().waitFor({ timeout: 10000 });
  const mdHtml = await page.locator('.omtn-reader article .omtn-markdown').first().innerHTML();
  ok('Markdown renderiza heading', mdHtml.includes('<h2'), '');
  ok('Markdown renderiza code block', mdHtml.includes('<pre'), '');
  ok('Comentários listados', (await page.locator('.omtn-comment').count()) === 2, `${await page.locator('.omtn-comment').count()} comentários`);
  await shot('02-reader');

  // ---------- Voto ----------
  const rootVote = page.locator('.omtn-reader article .omtn-vote');
  await rootVote.locator('button').first().click();
  await page.waitForTimeout(500);
  ok('Voto com sucesso atualiza contagem', (await rootVote.locator('.omtn-vote-count').textContent())?.trim() === '99');
  await rootVote.locator('button').last().click();
  await page.waitForTimeout(500);
  const voteMsg = await page.locator('.omtn-vote-message').first().textContent().catch(() => null);
  ok('Voto rejeitado (403) mostra aviso de login', !!voteMsg?.includes('Faça login'), voteMsg ?? 'sem mensagem');

  // ---------- Threads ----------
  await page.locator('.omtn-thread-link').first().click();
  await page.waitForTimeout(400);
  const threadHeader = await page.locator('.omtn-thread-header').textContent();
  ok('Thread nível 1 com cabeçalho', threadHeader?.includes('Respostas a') && threadHeader?.includes('commenter1'), threadHeader?.slice(0, 50) ?? '');
  ok('Thread mostra só respostas diretas', (await page.locator('.omtn-comment').count()) === 2);
  await shot('03-thread');

  await page.locator('.omtn-thread-link').first().click();
  await page.waitForTimeout(400);
  const thread2 = await page.locator('.omtn-thread-header').textContent();
  ok('Thread nível 2 (thread na thread)', thread2?.includes('commenter11'), thread2?.slice(0, 50) ?? '');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok('Esc volta pra thread nível 1', (await page.locator('.omtn-thread-header').textContent())?.includes('commenter1') ?? false);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok('Esc volta pra Leitura raiz', (await page.locator('.omtn-thread-header').count()) === 0 && (await reader.count()) === 1);

  // ---------- Esc: Leitura → capa → fechar ----------
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok('Esc fecha a Leitura', (await reader.count()) === 0);
  const counterBefore = await counter();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok('Esc fecha o overlay', (await page.locator('.omtn-overlay').count()) === 0);
  await fab.click();
  await page.waitForTimeout(500);
  ok('Reabrir mantém a posição', (await counter()) === counterBefore, `esperado ${counterBefore}, veio ${await counter()}`);

  // ---------- Fim de feed (Relevantes tem 5) ----------
  for (let i = 0; i < 12 && (await page.locator('.omtn-center h2').count()) === 0; i++) {
    await page.keyboard.press('j');
    await page.waitForTimeout(600);
  }
  const endTitle = await page.locator('.omtn-center h2').textContent().catch(() => null);
  ok('Fim de feed após o último Reel (9 itens)', endTitle?.includes('fim') ?? false, endTitle ?? 'não chegou');
  ok('Relevantes no fim não oferece estender', (await page.locator('button', { hasText: 'Estender' }).count()) === 0);
  ok('Fim oferece Rever Lidos e Trocar', (await page.locator('.omtn-center button', { hasText: 'Rever Lidos' }).count()) === 1);
  await shot('04-end');

  // ---------- Recentes: picker, período e estender ----------
  await page.goto('https://www.tabnews.com.br/recentes', { waitUntil: 'domcontentloaded' });
  await fab.waitFor({ state: 'visible', timeout: 10000 });
  await fab.click();
  await page.locator('.omtn-period-options').waitFor({ timeout: 10000 });
  ok('Recentes abre com picker', true);
  await page.locator('.omtn-period-options button', { hasText: '24 horas' }).click();
  await page.locator('.omtn-slide:not([style*="top"]) .omtn-title').waitFor({ timeout: 10000 });
  ok('Header mostra Recentes + 24h', ((await page.locator('.omtn-feedname').textContent()) ?? '').toLowerCase().includes('24'), (await page.locator('.omtn-feedname').textContent()) ?? '');

  // 24h tem 3 itens (101..103): avança até o fim
  await page.keyboard.press('j');
  await page.waitForTimeout(600);
  await page.keyboard.press('j');
  await page.waitForTimeout(600);
  await page.keyboard.press('j');
  await page.waitForTimeout(800);
  const endNew = await page.locator('.omtn-center h2').textContent().catch(() => null);
  ok('Fim do Período após 3 Reels de 24h', endNew?.includes('fim') ?? false, endNew ?? `counter=${await counter().catch(() => '?')}`);
  const extend7 = page.locator('.omtn-center button', { hasText: '7 dias' });
  ok('Fim oferece estender 7 e 30 dias', (await extend7.count()) === 1 && (await page.locator('.omtn-center button', { hasText: '30 dias' }).count()) === 1);
  await shot('05-end-24h');

  await extend7.click();
  await page.locator('.omtn-slide:not([style*="top"]) .omtn-title').waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  ok('Estender 7d continua no #4', (await counter()) === '#4', `counter=${await counter()}`);
  // 7d adiciona itens 104 e 105 → mais 2 e fim de novo
  await page.keyboard.press('j');
  await page.waitForTimeout(600);
  ok('Reel #5 dentro de 7d', (await counter()) === '#5', `counter=${await counter()}`);
  await page.keyboard.press('j');
  await page.waitForTimeout(800);
  const endNew2 = await page.locator('.omtn-center h2').textContent().catch(() => null);
  ok('Fim do Período 7d (itens de 30d NÃO vazaram)', endNew2?.includes('fim') ?? false, endNew2 ?? `counter=${await counter().catch(() => '?')}`);

  // ---------- FAB ausente fora de páginas de Feed ----------
  await page.goto('https://www.tabnews.com.br/tester/post-1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  ok('FAB ausente em página de Conteúdo', (await fab.count()) === 0);
} catch (error) {
  console.log('ERRO FATAL:', error.message.split('\n')[0]);
  await shot('99-fatal');
  results.push({ name: 'execução completa', pass: false, extra: error.message.split('\n')[0] });
} finally {
  const relevant = consoleErrors.filter((e) => !e.includes('third-party cookie') && !e.includes('net::') && !e.includes('favicon'));
  if (relevant.length) {
    console.log('\n--- console errors ---');
    console.log(relevant.slice(0, 10).join('\n'));
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passaram`);
  await context.close();
  process.exit(failed ? 1 : 0);
}
