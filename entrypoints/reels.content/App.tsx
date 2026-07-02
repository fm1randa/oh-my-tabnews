import { useEffect, useState } from 'react';
import type { ContentScriptContext } from '#imports';
import type { FeedStrategy } from '@/utils/api';
import { TOGGLE_REELS_MESSAGE } from '@/utils/features';
import ReelsMode from './ReelsMode';

// Páginas de Feed onde o Modo Reels pode ser aberto: home/Relevantes e Recentes,
// paginadas ou não. Páginas de usuário e de Conteúdo ficam de fora da v1.
const FEED_PATHS = [/^\/$/, /^\/pagina\/\d+\/?$/, /^\/recentes(\/pagina\/\d+)?\/?$/];

function isFeedPage(pathname: string) {
  return FEED_PATHS.some((pattern) => pattern.test(pathname));
}

function strategyFor(pathname: string): FeedStrategy {
  return pathname.startsWith('/recentes') ? 'new' : 'relevant';
}

export default function App({ ctx }: { ctx: ContentScriptContext }) {
  const [onFeedPage, setOnFeedPage] = useState(() => isFeedPage(location.pathname));
  const [open, setOpen] = useState(false);
  // A sessão fica montada após a primeira abertura para manter a posição na
  // mesma visita; trocar de Feed pela página remonta (key) e recomeça.
  const [sessionStrategy, setSessionStrategy] = useState<FeedStrategy | null>(null);

  const openReels = () => {
    const strategy = strategyFor(location.pathname);
    setSessionStrategy((current) => (current === strategy ? current : strategy));
    setOpen(true);
  };

  useEffect(() => {
    // O TabNews é um app Next.js: navegações não recarregam a página.
    ctx.addEventListener(window, 'wxt:locationchange', ({ newUrl }) => {
      setOnFeedPage(isFeedPage(newUrl.pathname));
    });
  }, [ctx]);

  useEffect(() => {
    const onMessage = (message: unknown) => {
      if ((message as { type?: string })?.type !== TOGGLE_REELS_MESSAGE) return;
      if (open) {
        setOpen(false);
      } else if (isFeedPage(location.pathname)) {
        openReels();
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, [open]);

  return (
    <>
      {onFeedPage && !open && (
        <button className="omtn-fab" title="Abrir o Modo Reels (Alt+R)" onClick={openReels}>
          ▶
        </button>
      )}
      {sessionStrategy && (
        <ReelsMode
          key={sessionStrategy}
          initialStrategy={sessionStrategy}
          visible={open}
          onRequestClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
