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

// O browser não expõe "dedos no touchpad". O único sinal confiável de que os
// dedos LEVANTARAM é a inércia: só existe depois do lift, e tem assinatura
// inconfundível (deltas decaindo exponencialmente, contínuos). Enquanto ela
// não aparece — e não há silêncio longo — o gesto pertence ao usuário: o card
// só segue o dedo e NUNCA decide sozinho, nem no arrasto completo.
const HOLD_END_MS = 600; // silêncio total = dedos pararam (ou levantaram sem inércia)
const GESTURE_GAP_MS = 600; // silêncio que separa gestos (fora da trava)
const COMMIT_RATIO = 0.5; // fração da tela para completar o slide
const SETTLE_MS = 320;
// Destravar exige um gesto novo DE VERDADE — timing sozinho não separa a
// inércia do trackpad de um gesto novo. O envelope decadente rastreia a
// magnitude da inércia: ela só decai, então um swipe novo "fura" o envelope
// rápido e o app responde sem esperar a cauda do swipe anterior morrer.
const UNLATCH_SILENCE_MS = 250; // pausa = mão parada
const RISE_MIN = 40; // delta mínimo pra contar como borda de subida
const RISE_FACTOR = 1.3; // sobe acima do envelope decaído = flick novo
const ENVELOPE_TAU_MS = 120; // meia-vida do envelope da inércia
const POST_COMMIT_GRACE_MS = 350; // nada destrava logo após um commit (settle + pico da inércia)
const FLICK_DELTA = 110; // pico de delta que caracteriza um flick
const FLICK_COMMIT_RATIO = 0.15; // flick comete com bem menos arrasto que o drag lento
// Assinatura da inércia (dedos levantaram): eventos consecutivos decaindo.
const INERTIA_RUN = 6; // eventos consecutivos em queda para confirmar
const INERTIA_JITTER = 1.05; // tolerância de flutuação entre eventos
const INERTIA_DECLINE = 0.7; // queda líquida mínima desde o início da sequência
const INERTIA_FLOOR = 6; // deltas minúsculos não contam

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
    peak: 0, // maior |delta| do gesto atual (flick vs drag lento)
    envelope: 0, // magnitude recente da inércia, decaindo no tempo
    lastAt: 0,
    lastDelta: 0, // delta do evento anterior (para detectar inversão)
    runLen: 0, // eventos consecutivos em decaimento (assinatura de inércia)
    runStartAbs: 0, // magnitude no início da sequência de decaimento
    latched: false, // já decidiu neste gesto — ignora o resto (inércia)
    latchedAt: 0,
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
    state.peak = 0;
    state.runLen = 0;
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
      state.latchedAt = performance.now();
      // Semeia o envelope com a magnitude corrente: a inércia que vier
      // decai a partir daqui; só um delta acima dele destrava.
      state.envelope = Math.max(state.envelope, Math.abs(state.lastDelta), 60);
      const onTransitionEnd = (event: TransitionEvent) => {
        if (event.propertyName === 'transform' && event.target === track) finish();
      };
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
      // Arrasto já no alvo: nada a animar — transitionend nunca dispararia,
      // e esperar o fallback deixaria o commit lento. Comete imediatamente.
      if (Math.abs(displayOffset(state.raw) - targetPx) < 1) {
        finish();
        return;
      }
      track.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(0.25, 0.7, 0.3, 1)`;
      track.style.transform = `translateY(${-targetPx}px)`;
      track.addEventListener('transitionend', onTransitionEnd);
      // Fallback caso transitionend não dispare (aba oculta, etc.).
      state.settleTimer = setTimeout(finish, SETTLE_MS + 80);
    };

    const gestureEnd = () => {
      if (state.settling) return;
      const H = height();
      const offset = displayOffset(state.raw);
      const { hasPrev, hasNext } = neighborsRef.current;
      // Flick (pico alto) comete com pouco arrasto; drag lento exige metade da tela.
      const ratio = state.peak >= FLICK_DELTA ? FLICK_COMMIT_RATIO : COMMIT_RATIO;
      if (offset >= ratio * H && hasNext) {
        settleTo(H, 1);
      } else if (offset <= -ratio * H && hasPrev) {
        settleTo(-H, -1);
      } else {
        if (state.raw > 0.2 * H && !hasNext) callbacksRef.current.onOverscrollForward();
        settleTo(0, 0);
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const now = performance.now();
      const gap = now - state.lastAt;
      state.lastAt = now;
      const delta = event.deltaY;
      const abs = Math.abs(delta);
      const prevDelta = state.lastDelta;
      state.lastDelta = delta;

      // Envelope decai com o tempo desde o último evento.
      state.envelope *= Math.exp(-gap / ENVELOPE_TAU_MS);

      if (state.settling) {
        state.envelope = Math.max(state.envelope, abs);
        return;
      }

      if (state.latched) {
        // Destrava só um gesto novo de verdade: delta furando o envelope da
        // inércia, direção invertida ou pausa real — após a graça pós-commit.
        // O |delta anterior| entra na referência para que um stream plano
        // nunca fure o próprio envelope só porque o tempo o decaiu.
        const reference = Math.max(state.envelope, Math.abs(prevDelta));
        const risingEdge = abs >= RISE_MIN && abs > reference * RISE_FACTOR;
        const reversed = prevDelta !== 0 && Math.sign(delta) !== Math.sign(prevDelta) && abs >= RISE_MIN;
        const silence = gap > UNLATCH_SILENCE_MS;
        const pastGrace = now - state.latchedAt > POST_COMMIT_GRACE_MS;
        if (!pastGrace || !(silence || risingEdge || reversed)) {
          state.envelope = Math.max(state.envelope, abs);
          return;
        }
        state.latched = false;
        state.raw = 0;
        state.peak = 0;
        state.runLen = 0;
      } else if (gap > GESTURE_GAP_MS) {
        state.raw = 0; // gesto novo começa do zero
        state.peak = 0;
        state.runLen = 0;
      }

      state.envelope = Math.max(state.envelope, abs);
      state.raw += delta;
      state.peak = Math.max(state.peak, abs);
      apply();

      // Assinatura de inércia: sequência contínua de deltas decaindo com queda
      // líquida — só acontece depois que os dedos levantam. É o único momento
      // em que decidimos com eventos ainda chegando.
      if (abs >= INERTIA_FLOOR && Math.abs(prevDelta) >= INERTIA_FLOOR && abs <= Math.abs(prevDelta) * INERTIA_JITTER) {
        if (state.runLen === 0) state.runStartAbs = Math.abs(prevDelta);
        state.runLen += 1;
      } else {
        state.runLen = 0;
      }
      const inertiaConfirmed =
        state.runLen >= INERTIA_RUN &&
        abs <= state.runStartAbs * INERTIA_DECLINE &&
        state.peak >= FLICK_DELTA;

      if (state.endTimer) clearTimeout(state.endTimer);
      if (inertiaConfirmed) {
        gestureEnd(); // dedos levantaram: decide já; a trava absorve o resto
        return;
      }
      // Sem inércia detectada, o gesto é do usuário: só o silêncio decide.
      // Dedos parados seguram o card; retomar continua o mesmo acumulado.
      state.endTimer = setTimeout(gestureEnd, HOLD_END_MS);
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
      state.latchedAt = performance.now();
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
