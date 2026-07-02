import { ReactNode, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { ContentSummary } from '@/utils/api';

// Deck de swipe sobre SCROLL NATIVO com CSS scroll-snap — a mesma técnica do
// TikTok web. JavaScript nunca sabe se os dedos estão no touchpad (eventos de
// wheel não carregam fase de gesto), mas o compositor do browser sabe: com
// scroll-snap-type mandatory + scroll-snap-stop always, segurar os dedos
// segura o card, soltar faz o snap, a inércia é tratada nativamente e nenhum
// gesto atravessa mais de um Reel. O JS só observa onde o scroll assentou
// (scrollend) e comete a troca de Reel.

export interface SwipeDeckHandle {
  swipe(direction: 1 | -1): void;
}

interface Props {
  prevItem: ContentSummary | null;
  item: ContentSummary;
  nextItem: ContentSummary | null;
  onCommit: (direction: 1 | -1) => void;
  onOverscrollForward: () => void;
  renderCard: (item: ContentSummary, offset: -1 | 0 | 1) => ReactNode;
}

const OVERSCROLL_TRIGGER_PX = 150; // arrasto além do fim para pedir mais/fechar
const OVERSCROLL_COOLDOWN_MS = 600;

const SwipeDeck = forwardRef<SwipeDeckHandle, Props>(function SwipeDeck(
  { prevItem, item, nextItem, onCommit, onOverscrollForward, renderCard },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const centerIndexRef = useRef(prevItem ? 1 : 0);
  centerIndexRef.current = prevItem ? 1 : 0;

  const callbacksRef = useRef({ onCommit, onOverscrollForward });
  callbacksRef.current = { onCommit, onOverscrollForward };

  const overscroll = useRef({ accumulated: 0, lastTriggerAt: 0 });
  const hasNextRef = useRef(!!nextItem);
  hasNextRef.current = !!nextItem;

  // Centraliza no Reel corrente sem animação — na montagem e após cada commit.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: centerIndexRef.current * viewport.clientHeight, behavior: 'instant' });
  }, [item.id, prevItem?.id, nextItem?.id]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // O scroll assentou num snap point: se não é o Reel do centro, comete.
    // Enquanto os dedos seguram o touchpad o scrollend não dispara — quem
    // sabe disso é o compositor, não a gente.
    const onScrollEnd = () => {
      const H = viewport.clientHeight || 1;
      const settledIndex = Math.round(viewport.scrollTop / H);
      const direction = settledIndex - centerIndexRef.current;
      if (direction === 1 || direction === -1) callbacksRef.current.onCommit(direction);
    };

    // Sem próximo Reel o scroll não sai do lugar: detecta a intenção de
    // avançar além do fim pelo acúmulo de deltas positivos no limite.
    const onWheel = (event: WheelEvent) => {
      if (hasNextRef.current || event.deltaY <= 0) {
        overscroll.current.accumulated = 0;
        return;
      }
      const H = viewport.clientHeight || 1;
      const atBottom = viewport.scrollTop >= (viewport.scrollHeight - H) - 2;
      if (!atBottom) return;
      overscroll.current.accumulated += event.deltaY;
      const now = performance.now();
      if (
        overscroll.current.accumulated >= OVERSCROLL_TRIGGER_PX &&
        now - overscroll.current.lastTriggerAt > OVERSCROLL_COOLDOWN_MS
      ) {
        overscroll.current.lastTriggerAt = now;
        overscroll.current.accumulated = 0;
        callbacksRef.current.onOverscrollForward();
      }
    };

    viewport.addEventListener('scrollend', onScrollEnd);
    viewport.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      viewport.removeEventListener('scrollend', onScrollEnd);
      viewport.removeEventListener('wheel', onWheel);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    swipe(direction) {
      const viewport = viewportRef.current;
      if (!viewport) return;
      if (direction === 1 && !hasNextRef.current) {
        callbacksRef.current.onOverscrollForward();
        return;
      }
      const H = viewport.clientHeight || 1;
      const target = (centerIndexRef.current + direction) * H;
      if (target < 0) return;
      viewport.scrollTo({ top: target, behavior: 'smooth' });
      // O commit vem do scrollend, igual ao gesto.
    },
  }));

  return (
    <div className="omtn-viewport" ref={viewportRef}>
      {prevItem && (
        <div className="omtn-slide" data-offset="-1" key={prevItem.id}>
          {renderCard(prevItem, -1)}
        </div>
      )}
      <div className="omtn-slide" data-offset="0" key={item.id}>
        {renderCard(item, 0)}
      </div>
      {nextItem && (
        <div className="omtn-slide" data-offset="1" key={nextItem.id}>
          {renderCard(nextItem, 1)}
        </div>
      )}
    </div>
  );
});

export default SwipeDeck;
