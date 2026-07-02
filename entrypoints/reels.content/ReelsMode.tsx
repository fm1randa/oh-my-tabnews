import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ContentSummary, FeedStrategy } from '@/utils/api';
import { fetchFeedPage } from '@/utils/api';
import { relativeTime } from '@/utils/format';
import { PERIODS, PeriodId, lastPeriod, periodCutoff, readContents } from '@/utils/reels';
import { FeedEngine } from './feed';
import Reader, { ReaderHandle } from './Reader';

type Stage = 'picker' | 'browsing' | 'end';

interface Slide {
  from: ContentSummary;
  to: ContentSummary;
  toIndex: number;
  direction: 1 | -1; // 1 = próximo (desliza pra cima), -1 = anterior
  started: boolean;
}

interface Props {
  initialStrategy: FeedStrategy;
  visible: boolean;
  onRequestClose: () => void;
}

export default function ReelsMode({ initialStrategy, visible, onRequestClose }: Props) {
  const [strategy, setStrategy] = useState<FeedStrategy>(initialStrategy);
  const [stage, setStage] = useState<Stage>('picker');
  const [period, setPeriod] = useState<PeriodId>('24h');
  const [index, setIndex] = useState(0);
  const [slide, setSlide] = useState<Slide | null>(null);
  const [readerItem, setReaderItem] = useState<ContentSummary | null>(null);
  const [, setVersion] = useState(0);

  const engineRef = useRef<FeedEngine | null>(null);
  const readMapRef = useRef<Record<string, string>>({});
  const readerRef = useRef<ReaderHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const ensureAhead = useCallback(
    async (targetIndex: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      await engine.ensure(targetIndex + 3);
      // Feed vazio já na entrada (ex.: Período sem publicações não lidas).
      if (engine.items.length === 0 && (engine.status === 'feed-end' || engine.status === 'period-end')) {
        setStage('end');
      }
      bump();
    },
    [bump],
  );

  const startSession = useCallback(
    async (options: { strategy: FeedStrategy; periodId?: PeriodId; includeRead?: boolean }) => {
      readMapRef.current = await readContents.getValue();
      const cutoffISO = options.strategy === 'new' ? periodCutoff(options.periodId ?? '24h') : null;
      engineRef.current = new FeedEngine({
        strategy: options.strategy,
        cutoffISO,
        includeRead: options.includeRead,
        isRead: (id) => id in readMapRef.current,
        fetchPage: fetchFeedPage,
      });
      setStrategy(options.strategy);
      if (options.periodId) setPeriod(options.periodId);
      setIndex(0);
      setStage('browsing');
      await ensureAhead(0);
    },
    [ensureAhead],
  );

  // Primeira abertura: Recentes exige Período (ADR 0004); Relevantes começa direto.
  useEffect(() => {
    if (!visible || engineRef.current) return;
    if (initialStrategy === 'new') {
      lastPeriod.getValue().then((saved) => {
        setPeriod(saved);
        setStage('picker');
      });
    } else {
      startSession({ strategy: 'relevant' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const markRead = useCallback((item: ContentSummary) => {
    if (item.id in readMapRef.current) return;
    readMapRef.current = { ...readMapRef.current, [item.id]: new Date().toISOString() };
    void readContents.setValue(readMapRef.current);
  }, []);

  const markUnread = useCallback(
    (item: ContentSummary) => {
      const { [item.id]: _removed, ...rest } = readMapRef.current;
      readMapRef.current = rest;
      void readContents.setValue(readMapRef.current);
      bump();
    },
    [bump],
  );

  const engine = engineRef.current;
  const items = engine?.items ?? [];
  const current = items[index];

  const slideTo = useCallback(
    (toIndex: number, direction: 1 | -1) => {
      const engine = engineRef.current;
      const from = engine?.items[index];
      const to = engine?.items[toIndex];
      if (!from || !to) return;
      // Nunca inicia um slide por cima de outro (ex.: avanço vindo do caminho assíncrono).
      setSlide((s) => s ?? { from, to, toIndex, direction, started: false });
    },
    [index],
  );

  // Dispara a transição no frame seguinte à montagem dos dois cards.
  useEffect(() => {
    if (!slide || slide.started) return;
    const frame = requestAnimationFrame(() => setSlide((s) => (s ? { ...s, started: true } : s)));
    return () => cancelAnimationFrame(frame);
  }, [slide]);

  const finishSlide = useCallback(() => {
    if (!slide) return;
    setIndex(slide.toIndex);
    setSlide(null);
    void ensureAhead(slide.toIndex);
  }, [slide, ensureAhead]);

  const next = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !current || slide) return;
    if (index + 1 < engine.items.length) {
      markRead(current);
      slideTo(index + 1, 1);
      return;
    }
    if (engine.status === 'feed-end' || engine.status === 'period-end') {
      markRead(current);
      setStage('end');
      return;
    }
    // Ainda pode haver mais: força uma rajada e avança se ela render algo.
    void ensureAhead(index + 1).then(() => {
      const updated = engineRef.current;
      if (!updated) return;
      if (index + 1 < updated.items.length) {
        markRead(current);
        slideTo(index + 1, 1);
      } else if (updated.status === 'feed-end' || updated.status === 'period-end') {
        markRead(current);
        setStage('end');
      }
      bump();
    });
  }, [current, index, slide, slideTo, ensureAhead, markRead, bump]);

  const prev = useCallback(() => {
    if (slide || index === 0) return;
    slideTo(index - 1, -1);
  }, [slide, index, slideTo]);

  const pickPeriod = useCallback(
    (id: PeriodId) => {
      void lastPeriod.setValue(id);
      void startSession({ strategy: 'new', periodId: id });
    },
    [startSession],
  );

  const extendPeriod = useCallback(
    (id: PeriodId) => {
      const engine = engineRef.current;
      if (!engine) return;
      void lastPeriod.setValue(id);
      setPeriod(id);
      engine.extendPeriod(periodCutoff(id));
      setStage('browsing');
      const nextIndex = Math.min(index + 1, engine.items.length);
      void ensureAhead(nextIndex).then(() => {
        const updated = engineRef.current;
        if (!updated) return;
        if (nextIndex < updated.items.length) {
          setIndex(nextIndex);
        } else if (updated.status === 'feed-end' || updated.status === 'period-end') {
          setStage('end');
        }
        bump();
      });
    },
    [index, ensureAhead, bump],
  );

  const switchFeed = useCallback(() => {
    engineRef.current = null;
    if (strategy === 'relevant') {
      setStrategy('new');
      setStage('picker');
    } else {
      void startSession({ strategy: 'relevant' });
    }
  }, [strategy, startSession]);

  // Teclado: Esc desce um nível; setas/j/k navegam na capa; Enter abre a Leitura.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (readerRef.current?.handleEscape()) return;
        if (readerItem) {
          setReaderItem(null);
        } else {
          onRequestClose();
        }
        return;
      }
      if (readerItem || stage !== 'browsing') return;
      if (event.key === 'ArrowDown' || event.key === 'j') {
        event.preventDefault();
        next();
      } else if (event.key === 'ArrowUp' || event.key === 'k') {
        event.preventDefault();
        prev();
      } else if (event.key === 'Enter' && current) {
        setReaderItem(current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, readerItem, stage, next, prev, current, onRequestClose]);

  // Roda do mouse na capa: um gesto move exatamente um Reel. Depois de navegar,
  // o gesto fica "travado" até terminar (pausa nos eventos de wheel) — assim a
  // inércia do trackpad ou um scroll longo nunca pulam vários Reels.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !visible) return;
    const GESTURE_GAP_MS = 250;
    const THRESHOLD = 60;
    let accumulated = 0;
    let lastEventAt = 0;
    let latched = false;
    const onWheel = (event: WheelEvent) => {
      if (readerItem || stage !== 'browsing') return; // na Leitura a roda rola o texto
      event.preventDefault();
      const now = Date.now();
      if (now - lastEventAt > GESTURE_GAP_MS) {
        // Silêncio na roda = gesto anterior terminou; começa um gesto novo.
        accumulated = 0;
        latched = false;
      }
      lastEventAt = now;
      if (latched) return;
      accumulated += event.deltaY;
      if (Math.abs(accumulated) >= THRESHOLD) {
        latched = true;
        if (accumulated > 0) next();
        else prev();
        accumulated = 0;
      }
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [visible, readerItem, stage, next, prev]);

  // Trava o scroll da página enquanto o overlay está aberto.
  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [visible]);

  const feedLabel = strategy === 'relevant' ? 'Relevantes' : 'Recentes';
  const periodLabel = useMemo(() => PERIODS.find((p) => p.id === period)?.label ?? '', [period]);

  if (!visible) return null;

  return (
    <div className="omtn-overlay" role="dialog" aria-label="Modo Reels" ref={rootRef}>
      <header className="omtn-topbar">
        <span className="omtn-feedname">
          {feedLabel}
          {strategy === 'new' && stage !== 'picker' ? ` · ${periodLabel.toLowerCase()}` : ''}
          {engine?.includeRead ? ' · revendo lidos' : ''}
        </span>
        <button className="omtn-close" title="Fechar (Esc)" onClick={onRequestClose}>
          ×
        </button>
      </header>

      {stage === 'picker' && (
        <div className="omtn-center">
          <h2>O que entra no feed?</h2>
          <p className="omtn-muted">Recentes não tem fim — escolha um recorte pra ele acabar.</p>
          <div className="omtn-period-options">
            {PERIODS.map((option) => (
              <button
                key={option.id}
                className={option.id === period ? 'omtn-primary' : ''}
                autoFocus={option.id === period}
                onClick={() => pickPeriod(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {stage === 'browsing' && current && (
        <div className="omtn-viewport">
          <div
            className="omtn-track"
            style={
              slide
                ? {
                    transform: slide.started ? `translateY(${slide.direction * -100}%)` : 'translateY(0)',
                    transition: slide.started ? undefined : 'none',
                  }
                : { transform: 'translateY(0)', transition: 'none' }
            }
            onTransitionEnd={(event) => {
              if (event.propertyName === 'transform' && event.target === event.currentTarget) finishSlide();
            }}
          >
            {(slide ? [slide.from, slide.to] : [current]).map((item, position) => (
              <div
                key={item.id}
                className="omtn-slide"
                style={slide && position === 1 ? { top: `${slide.direction * 100}%` } : undefined}
              >
                <ReelCard
                  item={item}
                  number={(slide && position === 1 ? slide.toIndex : index) + 1}
                  isRead={item.id in readMapRef.current}
                  onOpen={() => setReaderItem(item)}
                  onMarkUnread={() => markUnread(item)}
                  onNext={next}
                  onPrev={prev}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {stage === 'browsing' && !current && engine?.status === 'loading' && (
        <div className="omtn-center omtn-muted">Carregando o feed…</div>
      )}

      {stage === 'browsing' && engine?.status === 'stalled' && !current && (
        <StalledNotice engine={engine} onContinue={() => engine.continueScanning(index + 3).then(bump)} onStop={() => setStage('end')} />
      )}

      {stage === 'browsing' && engine?.status === 'stalled' && current && index === items.length - 1 && (
        <div className="omtn-stalled-inline">
          <span className="omtn-muted">
            Nada novo nas últimas {engine.scannedSinceLastHit} publicações varridas.
          </span>
          <button onClick={() => engine.continueScanning(index + 4).then(bump)}>Continuar varrendo</button>
          <button onClick={() => setStage('end')}>Parar por aqui</button>
        </div>
      )}

      {stage === 'browsing' && engine?.status === 'error' && (
        <div className="omtn-stalled-inline">
          <span className="omtn-muted">Erro ao buscar o feed: {engine.errorMessage}</span>
          <button onClick={() => ensureAhead(index)}>Tentar de novo</button>
        </div>
      )}

      {stage === 'end' && (
        <div className="omtn-center">
          <h2>Você chegou ao fim 🎉</h2>
          <p className="omtn-muted">
            {strategy === 'relevant'
              ? 'Os Relevantes de hoje acabaram.'
              : `Fim das publicações de ${periodLabel.toLowerCase()}.`}
          </p>
          <div className="omtn-period-options">
            {strategy === 'new' &&
              engine?.status !== 'feed-end' &&
              PERIODS.filter((option) => option.ms > (PERIODS.find((p) => p.id === period)?.ms ?? 0)).map((option) => (
                <button key={option.id} className="omtn-primary" onClick={() => extendPeriod(option.id)}>
                  Estender: {option.label.toLowerCase()}
                </button>
              ))}
            {!engine?.includeRead && (
              <button onClick={() => startSession({ strategy, periodId: period, includeRead: true })}>
                Rever Lidos
              </button>
            )}
            <button onClick={switchFeed}>
              Trocar para {strategy === 'relevant' ? 'Recentes' : 'Relevantes'}
            </button>
            <button onClick={onRequestClose}>Fechar</button>
          </div>
        </div>
      )}

      {readerItem && <Reader ref={readerRef} item={readerItem} onClose={() => setReaderItem(null)} />}
    </div>
  );
}

function ReelCard({
  item,
  number,
  isRead,
  onOpen,
  onMarkUnread,
  onNext,
  onPrev,
}: {
  item: ContentSummary;
  number: number;
  isRead: boolean;
  onOpen: () => void;
  onMarkUnread: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  return (
    <article className="omtn-reel" onClick={onOpen}>
      <div className="omtn-reel-meta-top">
        <span className="omtn-counter">#{number}</span>
        {isRead && (
          <button
            className="omtn-chip"
            title="Este Conteúdo está marcado como lido"
            onClick={(event) => {
              event.stopPropagation();
              onMarkUnread();
            }}
          >
            lido ✓ · desfazer
          </button>
        )}
      </div>
      <h1 className="omtn-title">{item.title}</h1>
      <footer className="omtn-reel-footer">
        <div className="omtn-byline">
          <strong>{item.owner_username}</strong>
          <span className="omtn-muted">
            {item.tabcoins} tabcoins · {item.children_deep_count} comentários
            <br />
            {relativeTime(item.published_at)}
          </span>
        </div>
        <div className="omtn-navbuttons" onClick={(event) => event.stopPropagation()}>
          <button className="omtn-navbtn omtn-navbtn-secondary" title="Anterior (k / ↑)" onClick={onPrev}>
            ↓
          </button>
          <button className="omtn-navbtn" title="Próximo (j / ↓)" onClick={onNext}>
            ↑
          </button>
        </div>
      </footer>
    </article>
  );
}

function StalledNotice({
  engine,
  onContinue,
  onStop,
}: {
  engine: FeedEngine;
  onContinue: () => void;
  onStop: () => void;
}) {
  return (
    <div className="omtn-center">
      <h2>Nada novo por enquanto</h2>
      <p className="omtn-muted">
        Varri {engine.scannedSinceLastHit} publicações e todas já estavam lidas.
      </p>
      <div className="omtn-period-options">
        <button className="omtn-primary" onClick={onContinue}>
          Continuar varrendo
        </button>
        <button onClick={onStop}>Parar por aqui</button>
      </div>
    </div>
  );
}
