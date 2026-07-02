// Cliente da API pública do TabNews. Fatos verificados em docs/tabnews-api.md.

export type FeedStrategy = 'relevant' | 'new';

export interface ContentSummary {
  id: string;
  title: string | null;
  slug: string;
  owner_username: string;
  tabcoins: number;
  children_deep_count: number;
  published_at: string;
  source_url: string | null;
  type: string;
}

export interface ContentFull extends ContentSummary {
  body: string;
}

export interface CommentNode {
  id: string;
  parent_id: string;
  owner_username: string;
  slug: string;
  body: string;
  tabcoins: number;
  children_deep_count: number;
  published_at: string;
  children: CommentNode[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const BASE = `${location.origin}/api/v1`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) {
    let message = `Erro ${response.status}`;
    try {
      const body = await response.json();
      if (body?.message) message = body.message;
    } catch {
      // corpo não-JSON; mantém a mensagem genérica
    }
    throw new ApiError(response.status, message);
  }
  return response.json();
}

export const PER_PAGE = 100; // máximo aceito pela API

export function fetchFeedPage(strategy: FeedStrategy, page: number) {
  return request<ContentSummary[]>(`/contents?strategy=${strategy}&page=${page}&per_page=${PER_PAGE}`);
}

export function fetchContent(user: string, slug: string) {
  return request<ContentFull>(`/contents/${user}/${slug}`);
}

export function fetchChildrenTree(user: string, slug: string) {
  return request<CommentNode[]>(`/contents/${user}/${slug}/children`);
}

export function postTabcoins(user: string, slug: string, transactionType: 'credit' | 'debit') {
  return request<{ tabcoins: number }>(`/contents/${user}/${slug}/tabcoins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction_type: transactionType }),
  });
}
