/**
 * API de checkout (Mercado Pago) + webhook + auth por e-mail + download.
 * Preços e highresKey vêm do catálogo server-side (não confiar no cliente).
 *
 * Deploy:
 *   node scripts/sync-catalog.mjs
 *   cd workers/frreinert-api && npx wrangler deploy
 */

import catalog from './catalog.json';
import { emailOtpEmail, magicLinkEmail, orderApprovedEmail, sendMail } from './mail';

export interface Env {
  MERCADOPAGO_ACCESS_TOKEN?: string;
  MERCADOPAGO_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  FROM_EMAIL?: string;
  SITE_URL: string;
  ORDERS: KVNamespace;
  PHOTOS: R2Bucket;
}

type CatalogPhoto = {
  title: string;
  price: number;
  highresKey: string | null;
  preview?: string | null;
};

type ResolvedItem = {
  eventId: string;
  photoId: string;
  title: string;
  unitPrice: number;
  highresKey?: string;
  preview?: string;
};

type CheckoutRequest = {
  email: string;
  emailProof: string;
  items: Array<{ eventId: string; photoId: string }>;
};

type StoredOrder = {
  externalReference: string;
  preferenceId?: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected' | 'in_process';
  items: ResolvedItem[];
  total: number;
  createdAt: string;
  paidAt?: string;
  paymentId?: string;
  emailSentAt?: string;
};

type EmailIndex = { refs: string[] };
type MagicRecord = { email: string; exp: number };
type SessionRecord = { email: string; exp: number };
type OtpRecord = { code: string; exp: number; attempts: number };
type EmailProofRecord = { email: string; exp: number };
type DownloadGrant = {
  email: string;
  ref: string;
  eventId: string;
  photoId: string;
  exp: number;
};

const ALLOWED_ORIGINS = [
  'https://frreinert.com.br',
  'https://www.frreinert.com.br',
  'https://frreinert.github.io',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
];

const MAGIC_TTL_SEC = 60 * 15;
const SESSION_TTL_SEC = 60 * 60 * 24 * 7;
const ORDER_PENDING_TTL = 60 * 60 * 24 * 30;
const ORDER_PAID_TTL = 60 * 60 * 24 * 90;
const EMAIL_INDEX_TTL = 60 * 60 * 24 * 365;
const OTP_TTL_SEC = 60 * 10;
const EMAIL_PROOF_TTL_SEC = 60 * 30;
const DOWNLOAD_TOKEN_TTL_SEC = 60 * 15;
const OTP_MAX_ATTEMPTS = 5;
const RATE_ORDERS_LIMIT = 30;
const RATE_DOWNLOAD_LIMIT = 60;
const RATE_WINDOW_SEC = 60;

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = Boolean(origin && ALLOWED_ORIGINS.includes(origin));
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function resolveFromCatalog(eventId: string, photoId: string): ResolvedItem | null {
  const event = (catalog as { events: Record<string, { title: string; photos: Record<string, CatalogPhoto> }> })
    .events[eventId];
  const photo = event?.photos?.[photoId];
  if (!event || !photo || !Number.isFinite(photo.price) || photo.price < 0) return null;

  return {
    eventId,
    photoId,
    title: `${event.title} — ${photoId}`.slice(0, 250),
    unitPrice: photo.price,
    highresKey: photo.highresKey || undefined,
    preview: photo.preview || undefined,
  };
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function clientIp(request: Request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

/** Returns true when the caller should be rate-limited. */
async function isRateLimited(
  env: Env,
  bucket: string,
  limit: number,
  windowSec = RATE_WINDOW_SEC,
): Promise<boolean> {
  const key = `rate:${bucket}`;
  const raw = await env.ORDERS.get(key);
  const count = raw ? Number.parseInt(raw, 10) || 0 : 0;
  if (count >= limit) return true;
  await env.ORDERS.put(key, String(count + 1), { expirationTtl: windowSec });
  return false;
}

async function mintDownloadToken(env: Env, grant: Omit<DownloadGrant, 'exp'>): Promise<string> {
  const token = randomToken();
  const record: DownloadGrant = {
    ...grant,
    exp: Date.now() + DOWNLOAD_TOKEN_TTL_SEC * 1000,
  };
  await env.ORDERS.put(`dl:${token}`, JSON.stringify(record), {
    expirationTtl: DOWNLOAD_TOKEN_TTL_SEC,
  });
  return token;
}

function safeFilename(name: string) {
  const base = name.replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '') || 'foto.jpg';
  return base.slice(0, 120);
}

async function appendEmailIndex(env: Env, email: string, ref: string) {
  const key = `email:${email}`;
  const raw = await env.ORDERS.get(key);
  const index: EmailIndex = raw ? (JSON.parse(raw) as EmailIndex) : { refs: [] };
  if (!index.refs.includes(ref)) index.refs.push(ref);
  await env.ORDERS.put(key, JSON.stringify(index), { expirationTtl: EMAIL_INDEX_TTL });
}

async function saveOrder(env: Env, order: StoredOrder, ttl = ORDER_PENDING_TTL) {
  await env.ORDERS.put(`order:${order.externalReference}`, JSON.stringify(order), {
    expirationTtl: ttl,
  });
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
          service: 'frreinert-api',
          routes: [
            'POST /api/checkout',
            'POST /api/webhooks/mercadopago',
            'GET /api/orders?ref=...|payment_id=...',
            'GET /api/download?token=...|Authorization+eventId+photoId',
            'POST /api/auth/email-otp',
            'POST /api/auth/email-otp/confirm',
            'POST /api/auth/magic-link',
            'POST /api/auth/session',
            'GET /api/my-orders',
          ],
          mercadopagoConfigured: Boolean(env.MERCADOPAGO_ACCESS_TOKEN),
          webhookSecretConfigured: Boolean(env.MERCADOPAGO_WEBHOOK_SECRET),
          resendConfigured: Boolean(env.RESEND_API_KEY),
          ordersKv: Boolean(env.ORDERS),
          r2: Boolean(env.PHOTOS),
        },
        200,
        origin,
      );
    }

    if (url.pathname === '/api/checkout' && request.method === 'POST') {
      return handleCheckout(request, env, origin);
    }

    if (url.pathname === '/api/webhooks/mercadopago' && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    if (url.pathname === '/api/orders' && request.method === 'GET') {
      return handleOrderLookup(request, env, origin);
    }

    if (url.pathname === '/api/download' && request.method === 'GET') {
      return handleDownload(request, env, origin);
    }

    if (url.pathname === '/api/auth/email-otp' && request.method === 'POST') {
      return handleEmailOtp(request, env, origin);
    }

    if (url.pathname === '/api/auth/email-otp/confirm' && request.method === 'POST') {
      return handleEmailOtpConfirm(request, env, origin);
    }

    if (url.pathname === '/api/auth/magic-link' && request.method === 'POST') {
      return handleMagicLink(request, env, origin);
    }

    if (url.pathname === '/api/auth/session' && request.method === 'POST') {
      return handleCreateSession(request, env, origin);
    }

    if (url.pathname === '/api/my-orders' && request.method === 'GET') {
      return handleMyOrders(request, env, origin);
    }

    return json({ error: 'Not found' }, 404, origin);
  },
};

async function handleCheckout(request: Request, env: Env, origin: string | null) {
  if (!env.ORDERS) {
    return json({ error: 'Persistência de pedidos indisponível.' }, 501, origin);
  }
  if (!env.MERCADOPAGO_ACCESS_TOKEN) {
    return json({ error: 'Pagamento temporariamente indisponível.' }, 501, origin);
  }

  let body: CheckoutRequest;
  try {
    body = (await request.json()) as CheckoutRequest;
  } catch {
    return json({ error: 'JSON inválido' }, 400, origin);
  }

  const email = normalizeEmail(body?.email || '');
  if (!isValidEmail(email)) {
    return json({ error: 'Informe um e-mail válido.' }, 400, origin);
  }

  const emailProof = (body?.emailProof || '').trim();
  if (!emailProof) {
    return json({ error: 'Confirme seu e-mail antes de pagar.' }, 400, origin);
  }

  const proofRaw = await env.ORDERS.get(`emailproof:${emailProof}`);
  if (!proofRaw) {
    return json({ error: 'Confirmação de e-mail expirada. Envie o código novamente.' }, 401, origin);
  }
  const proof = JSON.parse(proofRaw) as EmailProofRecord;
  if (proof.exp < Date.now() || normalizeEmail(proof.email) !== email) {
    await env.ORDERS.delete(`emailproof:${emailProof}`);
    return json({ error: 'Confirmação de e-mail inválida. Envie o código novamente.' }, 401, origin);
  }

  if (!body?.items?.length) {
    return json({ error: 'Carrinho vazio' }, 400, origin);
  }

  const resolved: ResolvedItem[] = [];
  const seen = new Set<string>();

  for (const item of body.items) {
    if (!item?.eventId || !item?.photoId) {
      return json({ error: 'Item inválido no carrinho.' }, 400, origin);
    }
    const key = `${item.eventId}::${item.photoId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const photo = resolveFromCatalog(item.eventId, item.photoId);
    if (!photo) {
      return json(
        { error: 'Uma ou mais fotos não estão disponíveis para compra.' },
        400,
        origin,
      );
    }
    resolved.push(photo);
  }

  if (!resolved.length) {
    return json({ error: 'Carrinho vazio' }, 400, origin);
  }

  const total = resolved.reduce((sum, item) => sum + item.unitPrice, 0);
  const site = (env.SITE_URL || 'https://frreinert.com.br').replace(/\/$/, '');
  const workerOrigin = new URL(request.url).origin;
  const externalReference = `order_${crypto.randomUUID()}`;

  const order: StoredOrder = {
    externalReference,
    email,
    status: 'pending',
    items: resolved,
    total,
    createdAt: new Date().toISOString(),
  };

  await saveOrder(env, order, ORDER_PENDING_TTL);
  await appendEmailIndex(env, email, externalReference);

  const preference = {
    items: resolved.map((item) => ({
      id: `${item.eventId}:${item.photoId}`,
      title: item.title,
      quantity: 1,
      currency_id: 'BRL',
      unit_price: item.unitPrice,
    })),
    payer: { email },
    external_reference: externalReference,
    metadata: {
      external_reference: externalReference,
      email,
      items: resolved.map((i) => ({
        eventId: i.eventId,
        photoId: i.photoId,
        title: i.title,
        unitPrice: i.unitPrice,
      })),
    },
    back_urls: {
      success: `${site}/pedido/?ref=${encodeURIComponent(externalReference)}&status=success`,
      failure: `${site}/pedido/?ref=${encodeURIComponent(externalReference)}&status=failure`,
      pending: `${site}/pedido/?ref=${encodeURIComponent(externalReference)}&status=pending`,
    },
    auto_return: 'approved',
    notification_url: `${workerOrigin}/api/webhooks/mercadopago`,
  };

  const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(preference),
  });

  const mpData = (await mpRes.json()) as {
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
    message?: string;
    error?: string;
  };

  if (!mpRes.ok || !mpData.id) {
    return json(
      { error: mpData.message || mpData.error || `Mercado Pago HTTP ${mpRes.status}` },
      502,
      origin,
    );
  }

  const initPoint = mpData.init_point || mpData.sandbox_init_point;
  if (!initPoint) {
    return json({ error: 'Preference criada sem init_point' }, 502, origin);
  }

  order.preferenceId = mpData.id;
  await saveOrder(env, order, ORDER_PENDING_TTL);
  await env.ORDERS.delete(`emailproof:${emailProof}`);

  return json(
    {
      initPoint,
      preferenceId: mpData.id,
      externalReference,
    },
    200,
    origin,
  );
}

async function handleWebhook(request: Request, env: Env) {
  const url = new URL(request.url);
  const raw = await request.text();
  const query = Object.fromEntries(url.searchParams);

  if (!env.MERCADOPAGO_WEBHOOK_SECRET) {
    console.error('MERCADOPAGO_WEBHOOK_SECRET não configurado');
    return new Response('webhook secret required', { status: 501 });
  }

  const xSignature = request.headers.get('x-signature');
  if (!xSignature) {
    console.error('webhook sem header x-signature');
    return new Response('signature required', { status: 401 });
  }

  const valid = await verifyMercadoPagoSignature(
    request,
    raw,
    env.MERCADOPAGO_WEBHOOK_SECRET,
  );
  if (!valid) {
    console.error('webhook signature invalid');
    return new Response('invalid signature', { status: 401 });
  }

  let topic = (url.searchParams.get('topic') || url.searchParams.get('type') || '').toLowerCase();
  let resourceId =
    url.searchParams.get('data.id') ||
    url.searchParams.get('id') ||
    '';

  try {
    const body = JSON.parse(raw) as {
      type?: string;
      topic?: string;
      data?: { id?: string | number };
    };
    if (body?.type) topic = String(body.type).toLowerCase();
    if (body?.topic) topic = String(body.topic).toLowerCase();
    if (body?.data?.id) resourceId = String(body.data.id);
  } catch {
    // query-only
  }

  console.log('mercadopago webhook', { topic, resourceId, query });

  if (!resourceId || !env.MERCADOPAGO_ACCESS_TOKEN) {
    return new Response('ok', { status: 200 });
  }

  try {
    const paymentIds = await resolvePaymentIds(env, topic, resourceId);
    for (const paymentId of paymentIds) {
      const order = await syncPaymentToOrder(env, paymentId);
      console.log('payment synced', {
        paymentId,
        status: order?.status,
        ref: order?.externalReference,
      });
      if (order?.status === 'approved') {
        await maybeSendOrderEmail(env, order);
      }
    }
  } catch (err) {
    console.error('webhook sync failed', err);
  }

  return new Response('ok', { status: 200 });
}

async function maybeSendOrderEmail(env: Env, order: StoredOrder) {
  if (!order.email) return;

  const freshRaw = await env.ORDERS.get(`order:${order.externalReference}`);
  if (freshRaw) {
    const fresh = JSON.parse(freshRaw) as StoredOrder;
    if (fresh.emailSentAt) {
      order.emailSentAt = fresh.emailSentAt;
      return;
    }
    if (fresh.email) order.email = fresh.email;
  } else if (order.emailSentAt) {
    return;
  }

  const sent = await sendMail(env, orderApprovedEmail(env, order.email, order.externalReference));
  if (!sent) return;

  order.emailSentAt = new Date().toISOString();
  await saveOrder(env, order, ORDER_PAID_TTL);
}

async function verifyMercadoPagoSignature(
  request: Request,
  _rawBody: string,
  secret: string,
): Promise<boolean> {
  const xSignature = request.headers.get('x-signature');
  const xRequestId = request.headers.get('x-request-id');
  if (!xSignature || !xRequestId) return false;

  const parts: Record<string, string> = {};
  for (const part of xSignature.split(',')) {
    const [k, v] = part.split('=');
    if (k && v) parts[k.trim()] = v.trim();
  }
  const ts = parts.ts;
  const hash = parts.v1;
  if (!ts || !hash) return false;

  const url = new URL(request.url);
  const dataId = url.searchParams.get('data.id') || url.searchParams.get('id') || '';
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  const calculated = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');

  return timingSafeEqual(calculated, hash);
}

async function resolvePaymentIds(env: Env, topic: string, resourceId: string): Promise<string[]> {
  const token = env.MERCADOPAGO_ACCESS_TOKEN!;

  if (topic === 'merchant_order' || topic === 'topic_merchant_order_wh') {
    const res = await fetch(`https://api.mercadopago.com/merchant_orders/${resourceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.error('merchant_order fetch failed', res.status, resourceId);
      return [];
    }
    const order = (await res.json()) as {
      payments?: Array<{ id?: number | string }>;
    };
    return (order.payments || [])
      .map((p) => (p.id != null ? String(p.id) : ''))
      .filter(Boolean);
  }

  return [resourceId];
}

async function handleOrderLookup(request: Request, env: Env, origin: string | null) {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) {
    return json({ error: 'Indisponível' }, 501, origin);
  }

  if (await isRateLimited(env, `orders:${clientIp(request)}`, RATE_ORDERS_LIMIT)) {
    return json({ error: 'Muitas consultas. Tente novamente em instantes.' }, 429, origin);
  }

  const url = new URL(request.url);
  const ref = url.searchParams.get('ref') || '';
  const paymentId = url.searchParams.get('payment_id') || url.searchParams.get('collection_id') || '';
  const workerOrigin = url.origin;
  const session = await readSession(env, request);

  if (paymentId) {
    try {
      const order = await syncPaymentToOrder(env, paymentId);
      if (order) {
        return json(await publicOrder(env, order, workerOrigin, session), 200, origin);
      }
    } catch (err) {
      console.error('lookup by payment failed', err);
    }
  }

  if (ref) {
    const raw = await env.ORDERS.get(`order:${ref}`);
    if (raw) {
      const order = JSON.parse(raw) as StoredOrder;
      return json(await publicOrder(env, order, workerOrigin, session), 200, origin);
    }
  }

  if (ref) {
    return json(
      {
        externalReference: ref,
        status: 'pending',
        items: [],
        total: 0,
        message: 'Aguardando confirmação do pagamento.',
      },
      200,
      origin,
    );
  }

  return json({ error: 'Informe ref ou payment_id' }, 400, origin);
}

async function readSession(env: Env, request: Request): Promise<SessionRecord | null> {
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!bearer) return null;

  const raw = await env.ORDERS.get(`session:${bearer}`);
  if (!raw) return null;
  const session = JSON.parse(raw) as SessionRecord;
  if (!session.email || session.exp < Date.now()) return null;
  return session;
}

async function handleDownload(request: Request, env: Env, origin: string | null) {
  if (!env.PHOTOS) {
    return json({ error: 'Storage indisponível' }, 501, origin);
  }

  if (await isRateLimited(env, `download:${clientIp(request)}`, RATE_DOWNLOAD_LIMIT)) {
    return json({ error: 'Muitos downloads. Tente novamente em instantes.' }, 429, origin);
  }

  const url = new URL(request.url);
  const downloadToken = (url.searchParams.get('token') || '').trim();
  const eventId = url.searchParams.get('eventId') || '';
  const photoId = url.searchParams.get('photoId') || '';
  const ref = url.searchParams.get('ref') || '';
  const session = await readSession(env, request);

  let order: StoredOrder | null = null;
  let grantEventId = eventId;
  let grantPhotoId = photoId;

  if (downloadToken) {
    const rawGrant = await env.ORDERS.get(`dl:${downloadToken}`);
    if (!rawGrant) {
      return json({ error: 'Link de download expirado ou inválido.' }, 401, origin);
    }
    const grant = JSON.parse(rawGrant) as DownloadGrant;
    if (!grant.email || grant.exp < Date.now()) {
      await env.ORDERS.delete(`dl:${downloadToken}`);
      return json({ error: 'Link de download expirado ou inválido.' }, 401, origin);
    }

    const orderRaw = await env.ORDERS.get(`order:${grant.ref}`);
    if (!orderRaw) {
      return json({ error: 'Pedido não encontrado.' }, 404, origin);
    }
    order = JSON.parse(orderRaw) as StoredOrder;
    if (normalizeEmail(order.email) !== normalizeEmail(grant.email)) {
      return json({ error: 'Não autorizado' }, 403, origin);
    }
    grantEventId = grant.eventId;
    grantPhotoId = grant.photoId;
  } else if (session && eventId && photoId) {
    if (ref) {
      const raw = await env.ORDERS.get(`order:${ref}`);
      if (raw) order = JSON.parse(raw) as StoredOrder;
    } else {
      const indexRaw = await env.ORDERS.get(`email:${session.email}`);
      const refs: string[] = indexRaw ? (JSON.parse(indexRaw) as EmailIndex).refs : [];
      for (const orderRef of refs) {
        const raw = await env.ORDERS.get(`order:${orderRef}`);
        if (!raw) continue;
        const candidate = JSON.parse(raw) as StoredOrder;
        if (
          candidate.status === 'approved' &&
          normalizeEmail(candidate.email) === normalizeEmail(session.email) &&
          candidate.items.some((i) => i.eventId === eventId && i.photoId === photoId)
        ) {
          order = candidate;
          break;
        }
      }
    }

    if (!order || normalizeEmail(order.email) !== normalizeEmail(session.email)) {
      return json({ error: 'Sessão não autorizada para este pedido.' }, 403, origin);
    }
  } else {
    return json({ error: 'Não autorizado. Use Minhas fotos ou um link de download válido.' }, 401, origin);
  }

  if (!order || order.status !== 'approved') {
    return json({ error: 'Download indisponível para este pedido.' }, 403, origin);
  }

  const purchased = order.items.some((i) => i.eventId === grantEventId && i.photoId === grantPhotoId);
  if (!purchased) {
    return json({ error: 'Esta foto não faz parte do pedido.' }, 403, origin);
  }

  const catalogItem = resolveFromCatalog(grantEventId, grantPhotoId);
  const key = catalogItem?.highresKey;
  if (!key) {
    return json({ error: 'Arquivo não configurado.' }, 404, origin);
  }

  const object = await env.PHOTOS.get(key);
  if (!object) {
    console.error('R2 object missing', key);
    return json({ error: 'Arquivo ainda não disponível no storage.' }, 404, origin);
  }

  const filename = safeFilename(key.split('/').pop() || `${grantPhotoId}.jpg`);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Content-Disposition', `attachment; filename="${filename}"`);
  headers.set('Cache-Control', 'private, no-store');
  Object.entries(corsHeaders(origin)).forEach(([k, v]) => headers.set(k, String(v)));

  return new Response(object.body, { status: 200, headers });
}

async function handleEmailOtp(request: Request, env: Env, origin: string | null) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return json({ error: 'JSON inválido' }, 400, origin);
  }

  const email = normalizeEmail(body?.email || '');
  const okResponse = json(
    { ok: true, message: 'Se o e-mail for válido, enviamos um código de verificação.' },
    200,
    origin,
  );

  if (!isValidEmail(email)) {
    return okResponse;
  }

  if (!env.RESEND_API_KEY) {
    return json({ error: 'Envio de e-mail temporariamente indisponível.' }, 501, origin);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateKey = `rate:otp:${email}:${ip}`;
  if (await env.ORDERS.get(rateKey)) {
    return okResponse;
  }
  await env.ORDERS.put(rateKey, '1', { expirationTtl: 60 });

  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  const record: OtpRecord = {
    code,
    exp: Date.now() + OTP_TTL_SEC * 1000,
    attempts: 0,
  };
  await env.ORDERS.put(`otp:${email}`, JSON.stringify(record), { expirationTtl: OTP_TTL_SEC });

  const sent = await sendMail(env, emailOtpEmail(email, code));
  if (!sent) {
    return json({ error: 'Não foi possível enviar o código. Tente novamente.' }, 502, origin);
  }

  return okResponse;
}

async function handleEmailOtpConfirm(request: Request, env: Env, origin: string | null) {
  let body: { email?: string; code?: string };
  try {
    body = (await request.json()) as { email?: string; code?: string };
  } catch {
    return json({ error: 'JSON inválido' }, 400, origin);
  }

  const email = normalizeEmail(body?.email || '');
  const code = String(body?.code || '').replace(/\s+/g, '').trim();

  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return json({ error: 'Código inválido.' }, 400, origin);
  }

  const raw = await env.ORDERS.get(`otp:${email}`);
  if (!raw) {
    return json({ error: 'Código expirado. Solicite um novo.' }, 401, origin);
  }

  const otp = JSON.parse(raw) as OtpRecord;
  if (otp.exp < Date.now()) {
    await env.ORDERS.delete(`otp:${email}`);
    return json({ error: 'Código expirado. Solicite um novo.' }, 401, origin);
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await env.ORDERS.delete(`otp:${email}`);
    return json({ error: 'Muitas tentativas. Solicite um novo código.' }, 429, origin);
  }

  if (!timingSafeEqual(otp.code, code)) {
    otp.attempts += 1;
    await env.ORDERS.put(`otp:${email}`, JSON.stringify(otp), {
      expirationTtl: Math.max(60, Math.ceil((otp.exp - Date.now()) / 1000)),
    });
    return json({ error: 'Código inválido.' }, 401, origin);
  }

  await env.ORDERS.delete(`otp:${email}`);

  const emailProof = randomToken();
  const proof: EmailProofRecord = {
    email,
    exp: Date.now() + EMAIL_PROOF_TTL_SEC * 1000,
  };
  await env.ORDERS.put(`emailproof:${emailProof}`, JSON.stringify(proof), {
    expirationTtl: EMAIL_PROOF_TTL_SEC,
  });

  return json({ emailProof, email, expiresIn: EMAIL_PROOF_TTL_SEC }, 200, origin);
}

async function handleMagicLink(request: Request, env: Env, origin: string | null) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return json({ error: 'JSON inválido' }, 400, origin);
  }

  const email = normalizeEmail(body?.email || '');
  // Resposta genérica sempre (não revelar se existe)
  const okResponse = json(
    { ok: true, message: 'Se houver compras neste e-mail, enviamos um link de acesso.' },
    200,
    origin,
  );

  if (!isValidEmail(email)) {
    return okResponse;
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateKey = `rate:magic:${email}:${ip}`;
  const rateRaw = await env.ORDERS.get(rateKey);
  if (rateRaw) {
    return okResponse;
  }
  await env.ORDERS.put(rateKey, '1', { expirationTtl: 60 });

  const indexRaw = await env.ORDERS.get(`email:${email}`);
  if (!indexRaw) {
    return okResponse;
  }

  const token = randomToken();
  const record: MagicRecord = { email, exp: Date.now() + MAGIC_TTL_SEC * 1000 };
  await env.ORDERS.put(`magic:${token}`, JSON.stringify(record), {
    expirationTtl: MAGIC_TTL_SEC,
  });

  await sendMail(env, magicLinkEmail(env, email, token));
  return okResponse;
}

async function handleCreateSession(request: Request, env: Env, origin: string | null) {
  let body: { token?: string };
  try {
    body = (await request.json()) as { token?: string };
  } catch {
    return json({ error: 'JSON inválido' }, 400, origin);
  }

  const token = (body?.token || '').trim();
  if (!token) {
    return json({ error: 'Token inválido' }, 400, origin);
  }

  const raw = await env.ORDERS.get(`magic:${token}`);
  if (!raw) {
    return json({ error: 'Link expirado ou inválido.' }, 401, origin);
  }

  const magic = JSON.parse(raw) as MagicRecord;
  await env.ORDERS.delete(`magic:${token}`);

  if (!magic.email || magic.exp < Date.now()) {
    return json({ error: 'Link expirado ou inválido.' }, 401, origin);
  }

  const sessionToken = randomToken();
  const session: SessionRecord = {
    email: magic.email,
    exp: Date.now() + SESSION_TTL_SEC * 1000,
  };
  await env.ORDERS.put(`session:${sessionToken}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SEC,
  });

  return json({ sessionToken, email: magic.email, expiresIn: SESSION_TTL_SEC }, 200, origin);
}

async function handleMyOrders(request: Request, env: Env, origin: string | null) {
  const session = await readSession(env, request);
  if (!session) {
    return json({ error: 'Sessão inválida ou expirada.' }, 401, origin);
  }

  const indexRaw = await env.ORDERS.get(`email:${session.email}`);
  const refs: string[] = indexRaw ? (JSON.parse(indexRaw) as EmailIndex).refs : [];
  const workerOrigin = new URL(request.url).origin;

  const orders = [];
  for (const ref of refs) {
    const raw = await env.ORDERS.get(`order:${ref}`);
    if (!raw) continue;
    const order = JSON.parse(raw) as StoredOrder;
    if (order.status !== 'approved') continue;
    if (normalizeEmail(order.email) !== normalizeEmail(session.email)) continue;
    orders.push(await publicOrder(env, order, workerOrigin, session));
  }

  orders.sort((a, b) => {
    const da = a.paidAt || '';
    const db = b.paidAt || '';
    return db.localeCompare(da);
  });

  return json({ email: session.email, orders }, 200, origin);
}

async function syncPaymentToOrder(env: Env, paymentId: string): Promise<StoredOrder | null> {
  const token = env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return null;

  const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!payRes.ok) {
    console.error('payment fetch failed', payRes.status, paymentId);
    return null;
  }

  const payment = (await payRes.json()) as {
    id: number;
    status: string;
    external_reference?: string;
    transaction_amount?: number;
    payer?: { email?: string };
    metadata?: {
      email?: string;
      items?: Array<{
        eventId: string;
        photoId: string;
        title?: string;
        unitPrice?: number;
      }>;
      external_reference?: string;
    };
  };

  const externalReference =
    payment.external_reference || payment.metadata?.external_reference || '';
  if (!externalReference) return null;

  const mappedStatus = mapMpStatus(payment.status);

  let items: ResolvedItem[] = [];
  if (Array.isArray(payment.metadata?.items)) {
    for (const meta of payment.metadata!.items) {
      const resolved = resolveFromCatalog(meta.eventId, meta.photoId);
      if (resolved) items.push(resolved);
    }
  }

  let order: StoredOrder | null = null;
  const raw = await env.ORDERS.get(`order:${externalReference}`);
  if (raw) order = JSON.parse(raw) as StoredOrder;

  const emailFromPayment =
    normalizeEmail(payment.metadata?.email || payment.payer?.email || '') || '';

  if (!order) {
    if (!emailFromPayment || !items.length) {
      console.error('order missing in KV and incomplete payment metadata', externalReference);
      return null;
    }
    order = {
      externalReference,
      email: emailFromPayment,
      status: mappedStatus,
      items,
      total: items.reduce((s, i) => s + i.unitPrice, 0) || payment.transaction_amount || 0,
      createdAt: new Date().toISOString(),
    };
    await appendEmailIndex(env, order.email, externalReference);
  }

  order.status = mappedStatus;
  order.paymentId = String(payment.id);
  if (emailFromPayment && !order.email) order.email = emailFromPayment;
  if (items.length) {
    order.items = items;
    order.total = items.reduce((s, i) => s + i.unitPrice, 0);
  }
  if (mappedStatus === 'approved') {
    order.paidAt = order.paidAt || new Date().toISOString();
  }

  await saveOrder(env, order, mappedStatus === 'approved' ? ORDER_PAID_TTL : ORDER_PENDING_TTL);
  return order;
}

function mapMpStatus(status: string): StoredOrder['status'] {
  if (status === 'approved') return 'approved';
  if (status === 'rejected' || status === 'cancelled') return 'rejected';
  if (status === 'in_process' || status === 'pending' || status === 'in_mediation') {
    return 'in_process';
  }
  return 'pending';
}

async function publicOrder(
  env: Env,
  order: StoredOrder,
  workerOrigin: string,
  session: SessionRecord | null = null,
) {
  const approved = order.status === 'approved';
  const canDownload =
    approved &&
    Boolean(session?.email) &&
    normalizeEmail(session!.email) === normalizeEmail(order.email);

  const items = [];
  for (const item of order.items) {
    const catalogItem = resolveFromCatalog(item.eventId, item.photoId);
    const ready = approved && Boolean(item.highresKey || catalogItem?.highresKey);
    let downloadUrl: string | null = null;

    if (ready && canDownload && session) {
      const token = await mintDownloadToken(env, {
        email: session.email,
        ref: order.externalReference,
        eventId: item.eventId,
        photoId: item.photoId,
      });
      downloadUrl = `${workerOrigin}/api/download?token=${encodeURIComponent(token)}`;
    }

    items.push({
      eventId: item.eventId,
      photoId: item.photoId,
      title: item.title,
      unitPrice: item.unitPrice,
      preview: catalogItem?.preview || item.preview || null,
      downloadReady: ready && canDownload,
      downloadUrl,
    });
  }

  return {
    externalReference: order.externalReference,
    status: order.status,
    total: order.total,
    paidAt: order.paidAt,
    items,
    message: statusMessage(order.status, approved),
    ...(approved && !canDownload
      ? {
          accessHint:
            'Para baixar as fotos, acesse Minhas fotos com o mesmo e-mail da compra.',
        }
      : {}),
  };
}

function statusMessage(status: StoredOrder['status'], approved = false) {
  switch (status) {
    case 'approved':
      return approved
        ? 'Pagamento confirmado. Baixe suas fotos em alta resolução abaixo.'
        : 'Pagamento confirmado.';
    case 'rejected':
      return 'O pagamento não foi aprovado. Você pode tentar novamente.';
    case 'in_process':
      return 'Pagamento em análise. Assim que confirmar, liberamos as fotos.';
    default:
      return 'Aguardando confirmação do pagamento.';
  }
}
