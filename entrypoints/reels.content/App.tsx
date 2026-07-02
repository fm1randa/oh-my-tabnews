import { useEffect, useState } from 'react';
import type { ContentScriptContext } from '#imports';
import { TOGGLE_REELS_MESSAGE } from '@/utils/features';

// Páginas de Feed onde o Modo Reels pode ser aberto: home/Relevantes e Recentes,
// paginadas ou não. Páginas de usuário e de Conteúdo ficam de fora da v1.
const FEED_PATHS = [/^\/$/, /^\/pagina\/\d+\/?$/, /^\/recentes(\/pagina\/\d+)?\/?$/];

function isFeedPage(pathname: string) {
  return FEED_PATHS.some((pattern) => pattern.test(pathname));
}

export default function App({ ctx }: { ctx: ContentScriptContext }) {
  const [onFeedPage, setOnFeedPage] = useState(() => isFeedPage(location.pathname));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // O TabNews é um app Next.js: navegações não recarregam a página.
    ctx.addEventListener(window, 'wxt:locationchange', ({ newUrl }) => {
      setOnFeedPage(isFeedPage(newUrl.pathname));
    });
  }, [ctx]);

  useEffect(() => {
    const onMessage = (message: unknown) => {
      if ((message as { type?: string })?.type === TOGGLE_REELS_MESSAGE) {
        setOpen((current) => (onFeedPage ? !current : false));
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, [onFeedPage]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!onFeedPage) return null;

  return (
    <>
      {!open && (
        <button className="omtn-fab" title="Abrir o Modo Reels (Alt+R)" onClick={() => setOpen(true)}>
          ▶
        </button>
      )}
      {open && (
        <div className="omtn-overlay" role="dialog" aria-label="Modo Reels">
          <p className="omtn-placeholder">
            Modo Reels — em construção.
            <br />
            <small>Esc para fechar</small>
          </p>
        </div>
      )}
    </>
  );
}
