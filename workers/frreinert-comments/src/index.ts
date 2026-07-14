/**
 * API de comentários das publicações (frreinert.com.br).
 * Armazena em KV: uma chave `comments:<slug>` com array JSON.
 *
 * Deploy:
 *   cd workers/frreinert-comments && npx wrangler deploy
 */

export interface Env {
  COMMENTS: KVNamespace;
}

type Comment = {
  name: string;
  message: string;
  createdAt: string;
};

const ALLOWED_ORIGINS = [
  'https://frreinert.com.br',
  'https://www.frreinert.com.br',
  'https://frreinert.github.io',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
];

const SLUG_RE = /^[a-z0-9-]{1,120}$/;
const NAME_MAX = 60;
const MESSAGE_MAX = 2000;
const MAX_COMMENTS_PER_POST = 500;

const RATE_COOLDOWN_SEC = 30; // 1 comentário a cada 30s por IP
const RATE_HOURLY_LIMIT = 10; // máx. por hora por IP
const RATE_HOURLY_WINDOW_SEC = 60 * 60;

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = Boolean(origin && ALLOWED_ORIGINS.includes(origin));
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allowed && origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

function clientIp(request: Request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

async function readComments(env: Env, slug: string): Promise<Comment[]> {
  const raw = await env.COMMENTS.get(`comments:${slug}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Comment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Cooldown de 30s: KV exige TTL >= 60s, então grava o timestamp do último
 * comentário (TTL 60s) e compara a idade na leitura.
 * Limite horário: contador com TTL de 1h.
 */
async function isRateLimited(env: Env, ip: string): Promise<boolean> {
  const cooldownKey = `rate:cooldown:${ip}`;
  const lastRaw = await env.COMMENTS.get(cooldownKey);
  if (lastRaw) {
    const last = Number.parseInt(lastRaw, 10) || 0;
    if (Date.now() - last < RATE_COOLDOWN_SEC * 1000) return true;
  }

  const hourlyKey = `rate:hourly:${ip}`;
  const raw = await env.COMMENTS.get(hourlyKey);
  const count = raw ? Number.parseInt(raw, 10) || 0 : 0;
  if (count >= RATE_HOURLY_LIMIT) return true;

  await env.COMMENTS.put(cooldownKey, String(Date.now()), { expirationTtl: 60 });
  await env.COMMENTS.put(hourlyKey, String(count + 1), {
    expirationTtl: RATE_HOURLY_WINDOW_SEC,
  });
  return false;
}

async function handleGet(request: Request, env: Env, origin: string | null) {
  const url = new URL(request.url);
  const slug = (url.searchParams.get('slug') || '').trim();
  if (!SLUG_RE.test(slug)) {
    return json({ error: 'Slug inválido.' }, 400, origin);
  }

  const comments = await readComments(env, slug);
  return json({ comments }, 200, origin);
}

async function handlePost(request: Request, env: Env, origin: string | null) {
  let body: { slug?: string; name?: string; message?: string; website?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'JSON inválido.' }, 400, origin);
  }

  const slug = (body?.slug || '').trim();
  if (!SLUG_RE.test(slug)) {
    return json({ error: 'Slug inválido.' }, 400, origin);
  }

  // Honeypot: bots preenchem "website"; responde ok sem gravar.
  if ((body?.website || '').trim()) {
    const comments = await readComments(env, slug);
    return json({ comments }, 200, origin);
  }

  const name = (body?.name || '').trim().slice(0, NAME_MAX);
  const message = (body?.message || '').trim();
  if (!name) {
    return json({ error: 'Informe seu nome.' }, 400, origin);
  }
  if (!message) {
    return json({ error: 'Escreva uma mensagem.' }, 400, origin);
  }
  if (message.length > MESSAGE_MAX) {
    return json(
      { error: `Mensagem muito longa (máx. ${MESSAGE_MAX} caracteres).` },
      400,
      origin,
    );
  }

  if (await isRateLimited(env, clientIp(request))) {
    return json(
      { error: 'Muitos comentários em sequência. Aguarde um pouco e tente novamente.' },
      429,
      origin,
    );
  }

  const comments = await readComments(env, slug);
  if (comments.length >= MAX_COMMENTS_PER_POST) {
    return json({ error: 'Limite de comentários atingido nesta publicação.' }, 403, origin);
  }

  comments.push({
    name,
    message,
    createdAt: new Date().toISOString(),
  });

  await env.COMMENTS.put(`comments:${slug}`, JSON.stringify(comments));

  return json({ comments }, 201, origin);
}

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
        },
        200,
        origin,
      );
    }

    if (url.pathname === '/api/comments' && request.method === 'GET') {
      return handleGet(request, env, origin);
    }

    if (url.pathname === '/api/comments' && request.method === 'POST') {
      return handlePost(request, env, origin);
    }

    return json({ error: 'Not found' }, 404, origin);
  },
};
