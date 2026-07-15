/**
 * API de comentários das publicações (frreinert.com.br).
 * Armazena em KV: uma chave `comments:<slug>` com array JSON.
 *
 * Deploy:
 *   cd workers/frreinert-comments && npx wrangler deploy
 */

import { corsHeaders, json } from './lib/cors';
import type { Env } from './lib/types';
import { handleGetComments, handlePostComment } from './routes/comments';

export type { Env };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/' && request.method === 'GET') {
      return json(
        {
          ok: true,
          service: 'frreinert-comments',
          routes: ['GET /api/comments?slug=...', 'POST /api/comments'],
          kv: Boolean(env.COMMENTS),
          turnstileConfigured: Boolean(env.TURNSTILE_SECRET_KEY),
        },
        200,
        origin,
      );
    }

    if (url.pathname === '/api/comments' && request.method === 'GET') {
      return handleGetComments(request, env, origin);
    }

    if (url.pathname === '/api/comments' && request.method === 'POST') {
      return handlePostComment(request, env, origin);
    }

    return json({ error: 'Not found' }, 404, origin);
  },
};
