import { ReactNode, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { ContentSummary } from '@/utils/api';

// Deck de swipe estilo TikTok web: o track segue o gesto de scroll ao vivo e a
// decisão só acontece quando o gesto termina (pausa nos eventos de wheel =
// dedos fora do touchpad): passou do limiar → completa o slide; senão → volta.
// Um gesto compromete no máximo um Reel: o arrasto é limitado a ±1 tela e,
// após a decisão, o gesto fica travado até terminar de verdade (inércia inclusa).

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

const GESTURE_GAP_MS = 200; // silêncio que marca o fim de um gesto
const GESTURE_END_MS = 160; // debounce para decidir após o último evento
const COMMIT_RATIO = 0.5; // fração da tela para completar o slide
const SETTLE_MS = 320;

const SwipeDeck = forwardRef<SwipeDeckHandle, Props>(function SwipeDeck(
  { prevItem, item, nextItem, onCommit, onOverscrollForward, renderCard },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const neighborsRef = useRef({ hasPrev: !!prevItem, hasNext: !!nextItem });
  neighborsRef.current = { hasPrev: !!prevItem, hasNext: !!nextItem };

  const gesture = useRef({
    raw: 0, // deltaY acumulado do gesto atual
    lastAt: 0,
    latched: false, // já decidiu neste gesto — ignora o resto (inércia)
    settling: false, // animação de acomodação em andamento
    endTimer: 0 as ReturnType<typeof setTimeout> | 0,
    settleTimer: 0 as ReturnType<typeof setTimeout> | 0,
  });

  const callbacksRef = useRef({ onCommit, onOverscrollForward });
  callbacksRef.current = { onCommit, onOverscrollForward };

  // Novo Reel corrente (commit aplicado): zera o track instantaneamente.
  useEffect(() => {
    const state = gesture.current;
    state.raw = 0;
    state.settling = false;
    if (state.endTimer) clearTimeout(state.endTimer);
    if (state.settleTimer) clearTimeout(state.settleTimer);
    const track = trackRef.current;
    if (track) {
      track.style.transition = 'none';
      track.style.transform = 'translateY(0px)';
    }
  }, [item.id]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const state = gesture.current;

    const height = () => viewport.clientHeight || 1;

    // Offset exibido: limitado a ±1 tela; sem vizinho vira elástico curto.
    const displayOffset = (raw: number) => {
      const H = height();
      const { hasPrev, hasNext } = neighborsRef.current;
      if (raw > 0) return hasNext ? Math.min(raw, H) : rubber(raw, H);
      if (raw < 0) return hasPrev ? Math.max(raw, -H) : -rubber(-raw, H);
      return 0;
    };
    const rubber = (x: number, H: number) => 0.12 * H * (1 - Math.exp(-x / (0.3 * H)));

    const apply = () => {
      track.style.transition = 'none';
      track.style.transform = `translateY(${-displayOffset(state.raw)}px)`;
    };

    const settleTo = (targetPx: number, commit: 1 | -1 | 0) => {
      state.settling = true;
      state.latched = true;
      track.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(0.25, 0.7, 0.3, 1)`;
      track.style.transform = `translateY(${-targetPx}px)`;
      const finish = () => {
        if (state.settleTimer) clearTimeout(state.settleTimer);
        track.removeEventListener('transitionend', onTransitionEnd);
        if (commit !== 0) {
          callbacksRef.current.onCommit(commit); // re-render + reset via effect
        } else {
          state.settling = false;
          state.raw = 0;
        }
      };
      const onTransitionEnd = (event: TransitionEvent) => {
        if (event.propertyName === 'transform' && event.target === track) finish();
      };
      track.addEventListener('transitionend', onTransitionEnd);
      // Fallback: transitionend pode não disparar se o transform já era o alvo.
      state.settleTimer = setTimeout(finish, SETTLE_MS + 80);
    };

    const gestureEnd = () => {
      if (state.settling) return;
      const H = height();
      const offset = displayOffset(state.raw);
      const { hasPrev, hasNext } = neighborsRef.current;
      if (offset >= COMMIT_RATIO * H && hasNext) {
        settleTo(H, 1);
      } else if (offset <= -COMMIT_RATIO * H && hasPrev) {
        settleTo(-H, -1);
      } else {
        if (state.raw > 0.2 * H && !hasNext) callbacksRef.current.onOverscrollForward();
        settleTo(0, 0);
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const now = performance.now();
      const gapExceeded = now - state.lastAt > GESTURE_GAP_MS;
      state.lastAt = now;
      if (state.settling) return;
      if (state.latched) {
        if (!gapExceeded) return; // ainda é o mesmo gesto (ou sua inércia)
        state.latched = false;
        state.raw = 0;
      } else if (gapExceeded) {
        state.raw = 0; // gesto novo começa do zero
      }
      state.raw += event.deltaY;
      apply();
      if (state.endTimer) clearTimeout(state.endTimer);
      state.endTimer = setTimeout(gestureEnd, GESTURE_END_MS);
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', onWheel);
      if (state.endTimer) clearTimeout(state.endTimer);
      if (state.settleTimer) clearTimeout(state.settleTimer);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    swipe(direction) {
      const state = gesture.current;
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!viewport || !track || state.settling) return;
      const H = viewport.clientHeight || 1;
      const { hasPrev, hasNext } = neighborsRef.current;
      if (direction === 1 && !hasNext) {
        callbacksRef.current.onOverscrollForward();
        return;
      }
      if (direction === -1 && !hasPrev) return;
      state.settling = true;
      state.latched = true;
      track.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(0.25, 0.7, 0.3, 1)`;
      track.style.transform = `translateY(${-direction * H}px)`;
      const finish = () => {
        if (state.settleTimer) clearTimeout(state.settleTimer);
        track.removeEventListener('transitionend', onTransitionEnd);
        callbacksRef.current.onCommit(direction);
      };
      const onTransitionEnd = (event: TransitionEvent) => {
        if (event.propertyName === 'transform' && event.target === track) finish();
      };
      track.addEventListener('transitionend', onTransitionEnd);
      state.settleTimer = setTimeout(finish, SETTLE_MS + 80);
    },
  }));

  return (
    <div className="omtn-viewport" ref={viewportRef}>
      <div className="omtn-track" ref={trackRef}>
        {prevItem && (
          <div className="omtn-slide" style={{ top: '-100%' }} key={prevItem.id}>
            {renderCard(prevItem, -1)}
          </div>
        )}
        <div className="omtn-slide" key={item.id}>
          {renderCard(item, 0)}
        </div>
        {nextItem && (
          <div className="omtn-slide" style={{ top: '100%' }} key={nextItem.id}>
            {renderCard(nextItem, 1)}
          </div>
        )}
      </div>
    </div>
  );
});

export default SwipeDeck;
