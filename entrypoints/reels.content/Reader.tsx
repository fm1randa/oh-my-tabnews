import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { CommentNode, ContentFull, ContentSummary } from '@/utils/api';
import { ApiError, fetchChildrenTree, fetchContent, postTabcoins } from '@/utils/api';
import { relativeTime } from '@/utils/format';
import Markdown from './Markdown';

export interface ReaderHandle {
  /** Esc desce um nível: Thread → Leitura. Retorna true se consumiu o evento. */
  handleEscape: () => boolean;
}

interface Props {
  item: ContentSummary;
  onClose: () => void;
}

const Reader = forwardRef<ReaderHandle, Props>(function Reader({ item, onClose }, ref) {
  const [content, setContent] = useState<ContentFull | null>(null);
  const [comments, setComments] = useState<CommentNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Threads estilo Slack (ADR 0003): pilha de Comentários abertos, um nível por vez.
  const [threadStack, setThreadStack] = useState<CommentNode[]>([]);

  useImperativeHandle(ref, () => ({
    handleEscape: () => {
      if (threadStack.length > 0) {
        setThreadStack((stack) => stack.slice(0, -1));
        return true;
      }
      return false;
    },
  }));

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setComments(null);
    setError(null);
    setThreadStack([]);
    Promise.all([
      fetchContent(item.owner_username, item.slug),
      fetchChildrenTree(item.owner_username, item.slug),
    ])
      .then(([full, tree]) => {
        if (cancelled) return;
        setContent(full);
        setComments(tree);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  const openThread = threadStack[threadStack.length - 1];
  const visibleComments = openThread ? openThread.children : comments;
  const contentUrl = `${location.origin}/${item.owner_username}/${item.slug}`;

  return (
    <div className="omtn-reader">
      <header className="omtn-reader-topbar">
        <button onClick={() => (threadStack.length > 0 ? setThreadStack((s) => s.slice(0, -1)) : onClose())}>
          ← {threadStack.length > 0 ? 'Voltar à discussão' : 'Voltar ao Reel'}
        </button>
        <a href={contentUrl} target="_blank" rel="noreferrer">
          Abrir no TabNews ↗
        </a>
      </header>

      {error && <p className="omtn-muted">Erro ao carregar: {error}</p>}
      {!error && !content && <p className="omtn-muted">Carregando…</p>}

      {content && threadStack.length === 0 && (
        <article>
          <h1>{content.title}</h1>
          <div className="omtn-byline-row">
            <strong>{content.owner_username}</strong>
            <span className="omtn-muted">{relativeTime(content.published_at)}</span>
            <VoteButtons
              user={content.owner_username}
              slug={content.slug}
              initialTabcoins={content.tabcoins}
            />
          </div>
          {content.source_url && (
            <p>
              <a href={content.source_url} target="_blank" rel="noreferrer">
                {content.source_url} ↗
              </a>
            </p>
          )}
          <Markdown value={content.body} />
        </article>
      )}

      {openThread && (
        <section className="omtn-thread-header">
          <p className="omtn-muted">
            Respostas a <strong>{openThread.owner_username}</strong>: “{excerpt(openThread.body)}”
          </p>
          <Markdown value={openThread.body} />
        </section>
      )}

      {visibleComments && (
        <section className="omtn-comments">
          <h2>
            {threadStack.length > 0
              ? `${visibleComments.length} resposta${visibleComments.length === 1 ? '' : 's'}`
              : `${visibleComments.length} comentário${visibleComments.length === 1 ? '' : 's'}`}
          </h2>
          {visibleComments.map((comment) => (
            <Comment key={comment.id} node={comment} onOpenThread={(node) => setThreadStack((s) => [...s, node])} />
          ))}
        </section>
      )}
    </div>
  );
});

function Comment({ node, onOpenThread }: { node: CommentNode; onOpenThread: (node: CommentNode) => void }) {
  return (
    <div className="omtn-comment">
      <div className="omtn-byline-row">
        <strong>{node.owner_username}</strong>
        <span className="omtn-muted">{relativeTime(node.published_at)}</span>
        <VoteButtons user={node.owner_username} slug={node.slug} initialTabcoins={node.tabcoins} />
      </div>
      <Markdown value={node.body} />
      {node.children.length > 0 && (
        <button className="omtn-thread-link" onClick={() => onOpenThread(node)}>
          Ver {node.children.length} resposta{node.children.length === 1 ? '' : 's'} →
        </button>
      )}
    </div>
  );
}

function VoteButtons({
  user,
  slug,
  initialTabcoins,
}: {
  user: string;
  slug: string;
  initialTabcoins: number;
}) {
  const [tabcoins, setTabcoins] = useState(initialTabcoins);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function vote(type: 'credit' | 'debit') {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await postTabcoins(user, slug, type);
      setTabcoins(typeof result.tabcoins === 'number' ? result.tabcoins : tabcoins);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setMessage('Faça login no TabNews para votar.');
      } else {
        setMessage(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="omtn-vote">
      <button disabled={pending} title="Vale a pena (custa 2 TabCoins seus)" onClick={() => vote('credit')}>
        ▲
      </button>
      <span className="omtn-vote-count">{tabcoins}</span>
      <button disabled={pending} title="Não vale a pena (custa 2 TabCoins seus)" onClick={() => vote('debit')}>
        ▼
      </button>
      {message && <span className="omtn-vote-message">{message}</span>}
    </span>
  );
}

function excerpt(markdown: string, max = 80): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~\[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

export default Reader;
