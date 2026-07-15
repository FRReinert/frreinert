import { corsHeaders, json, rejectIfOriginNotAllowed } from '../lib/cors';
import { verifyTurnstile } from '../lib/turnstile';
import {
  MAX_COMMENTS_PER_POST,
  MESSAGE_MAX,
  NAME_MAX,
  RATE_COOLDOWN_SEC,
  RATE_HOURLY_LIMIT,
  RATE_HOURLY_WINDOW_SEC,
  SLUG_RE,
  type Comment,
  type Env,
} from '../lib/types';

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

export async function handleGetComments(request: Request, env: Env, origin: string | null) {
  const url = new URL(request.url);
  const slug = (url.searchParams.get('slug') || '').trim();
  if (!SLUG_RE.test(slug)) {
    return json({ error: 'Slug inválido.' }, 400, origin);
  }

  const comments = await readComments(env, slug);
  return json({ comments }, 200, origin);
}

export async function handlePostComment(request: Request, env: Env, origin: string | null) {
  const originRejected = rejectIfOriginNotAllowed(origin);
  if (originRejected) return originRejected;

  let body: {
    slug?: string;
    name?: string;
    message?: string;
    website?: string;
    turnstileToken?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'JSON inválido.' }, 400, origin);
  }

  const slug = (body?.slug || '').trim();
  if (!SLUG_RE.test(slug)) {
    return json({ error: 'Slug inválido.' }, 400, origin);
  }

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

  const ip = clientIp(request);
  const turnstileToken = (body?.turnstileToken || '').trim();
  if (!(await verifyTurnstile(env, turnstileToken, ip))) {
    return json(
      { error: 'Verificação de segurança falhou. Tente novamente.' },
      403,
      origin,
    );
  }

  if (await isRateLimited(env, ip)) {
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

export { corsHeaders };
