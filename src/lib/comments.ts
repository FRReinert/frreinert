/**
 * Cliente da API de comentários → Cloudflare Worker frreinert-comments.
 */

export const COMMENTS_API_BASE =
  (import.meta.env.PUBLIC_COMMENTS_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://frreinert-comments.fabricio-reinert.workers.dev';

export type PostComment = {
  name: string;
  message: string;
  createdAt: string;
};

export type CommentsResult =
  | { ok: true; comments: PostComment[] }
  | { ok: false; error: string };

export async function fetchComments(slug: string): Promise<CommentsResult> {
  try {
    const res = await fetch(
      `${COMMENTS_API_BASE}/api/comments?slug=${encodeURIComponent(slug)}`,
    );
    const data = (await res.json().catch(() => ({}))) as {
      comments?: PostComment[];
      error?: string;
    };
    if (!res.ok) {
      return { ok: false, error: data.error || `Erro HTTP ${res.status}` };
    }
    return { ok: true, comments: data.comments || [] };
  } catch {
    return { ok: false, error: 'Não foi possível carregar os comentários.' };
  }
}

export async function submitComment(input: {
  slug: string;
  name: string;
  message: string;
  website: string;
  turnstileToken?: string;
}): Promise<CommentsResult> {
  try {
    const res = await fetch(`${COMMENTS_API_BASE}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => ({}))) as {
      comments?: PostComment[];
      error?: string;
    };
    if (!res.ok) {
      return { ok: false, error: data.error || `Erro HTTP ${res.status}` };
    }
    return { ok: true, comments: data.comments || [] };
  } catch {
    return { ok: false, error: 'Não foi possível enviar. Verifique sua conexão.' };
  }
}
