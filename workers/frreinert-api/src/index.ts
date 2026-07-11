/**
 * API de checkout (Mercado Pago) + webhook + consulta de pedido.
 * Preços e highresKey vêm do catálogo server-side (não confiar no cliente).
 *
 * Deploy:
 *   node scripts/sync-catalog.mjs
 *   cd workers/frreinert-api && npx wrangler deploy
 */

import catalog from './catalog.json';

export interface Env {
  MERCADOPAGO_ACCESS_TOKEN?: string;
  MERCADOPAGO_WEBHOOK_SECRET?: string;
  SITE_URL: string;
  ORDERS?: KVNamespace;
}

type CatalogPhoto = {
  title: string;
  price: number;
  highresKey: string | null;
};

type ResolvedItem = {
  eventId: string;
  photoId: string;
  title: string;
  unitPrice: number;
  highresKey?: string;
};

type CheckoutRequest = {
  items: Array<{ eventId: string; photoId: string }>;
};

type StoredOrder = {
  externalReference: string;
  preferenceId?: string;
  status: 'pending' | 'approved' | 'rejected' | 'in_process';
  items: ResolvedItem[];
  total: number;
  createdAt: string;
  paidAt?: string;
  paymentId?: string;
};

const ALLOWED_ORIGINS = [
  'https://frreinert.github.io',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
];

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin': allowed && origin ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
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

function resolveFromCatalog(eventId: string, photoId: string): ResolvedItem | null {
  const event = (catalog as { events: Record<string, { title: string; photos: Record<string, CatalogPhoto> }> })
    .events[eventId];
  const photo = event?.photos?.[photoId];
  if (!event || !photo || !Number.isFinite(photo.price) || photo.price < 0) return null;

  return {
    eventId,
    photoId,
    title: `${event.title} — ${photo.title}`.slice(0, 250),
    unitPrice: photo.price,
    highresKey: photo.highresKey || undefined,
  };
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
          ],
          mercadopagoConfigured: Boolean(env.MERCADOPAGO_ACCESS_TOKEN),
          webhookSecretConfigured: Boolean(env.MERCADOPAGO_WEBHOOK_SECRET),
          ordersKv: Boolean(env.ORDERS),
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

    return json({ error: 'Not found' }, 404, origin);
  },
};

async function handleCheckout(request: Request, env: Env, origin: string | null) {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) {
    return json({ error: 'Pagamento temporariamente indisponível.' }, 501, origin);
  }

  let body: CheckoutRequest;
  try {
    body = (await request.json()) as CheckoutRequest;
  } catch {
    return json({ error: 'JSON inválido' }, 400, origin);
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
  const site = (env.SITE_URL || 'https://frreinert.github.io/frreinert').replace(/\/$/, '');
  const workerOrigin = new URL(request.url).origin;
  const externalReference = `order_${crypto.randomUUID()}`;

  const order: StoredOrder = {
    externalReference,
    status: 'pending',
    items: resolved,
    total,
    createdAt: new Date().toISOString(),
  };

  if (env.ORDERS) {
    await env.ORDERS.put(`order:${externalReference}`, JSON.stringify(order), {
      expirationTtl: 60 * 60 * 24 * 30,
    });
  }

  const preference = {
    items: resolved.map((item) => ({
      id: `${item.eventId}:${item.photoId}`,
      title: item.title,
      quantity: 1,
      currency_id: 'BRL',
      unit_price: item.unitPrice,
    })),
    external_reference: externalReference,
    metadata: {
      external_reference: externalReference,
      items: resolved.map((i) => ({
        eventId: i.eventId,
        photoId: i.photoId,
        title: i.title,
        unitPrice: i.unitPrice,
        // highresKey fica só no pedido server-side / KV — não espelhar no MP se possível
        // (metadata do MP pode ser lida via API com o token; ainda assim não vai ao browser)
        highresKey: i.highresKey ?? null,
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

  const initPoint = mpData.sandbox_init_point || mpData.init_point;
  if (!initPoint) {
    return json({ error: 'Preference criada sem init_point' }, 502, origin);
  }

  if (env.ORDERS) {
    order.preferenceId = mpData.id;
    await env.ORDERS.put(`order:${externalReference}`, JSON.stringify(order), {
      expirationTtl: 60 * 60 * 24 * 30,
    });
  }

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

  if (env.MERCADOPAGO_WEBHOOK_SECRET) {
    const xSignature = request.headers.get('x-signature');
    if (xSignature) {
      const valid = await verifyMercadoPagoSignature(
        request,
        raw,
        env.MERCADOPAGO_WEBHOOK_SECRET,
      );
      if (!valid) {
        console.error('webhook signature invalid');
        return new Response('invalid signature', { status: 401 });
      }
    } else {
      console.warn('webhook sem header x-signature (notificação legada?)');
    }
  } else {
    console.warn('MERCADOPAGO_WEBHOOK_SECRET não configurado — assinatura não validada');
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
    }
  } catch (err) {
    console.error('webhook sync failed', err);
  }

  return new Response('ok', { status: 200 });
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

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
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

  const url = new URL(request.url);
  const ref = url.searchParams.get('ref') || '';
  const paymentId = url.searchParams.get('payment_id') || url.searchParams.get('collection_id') || '';

  if (paymentId) {
    try {
      const order = await syncPaymentToOrder(env, paymentId);
      if (order) return json(publicOrder(order), 200, origin);
    } catch (err) {
      console.error('lookup by payment failed', err);
    }
  }

  if (ref && env.ORDERS) {
    const raw = await env.ORDERS.get(`order:${ref}`);
    if (raw) {
      const order = JSON.parse(raw) as StoredOrder;
      return json(publicOrder(order), 200, origin);
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
    metadata?: {
      items?: Array<{
        eventId: string;
        photoId: string;
        title?: string;
        unitPrice?: number;
        highresKey?: string | null;
      }>;
      external_reference?: string;
    };
  };

  const externalReference =
    payment.external_reference || payment.metadata?.external_reference || '';
  if (!externalReference) return null;

  const mappedStatus = mapMpStatus(payment.status);

  // Re-resolve do catálogo (fonte da verdade), não confiar só no metadata
  let items: ResolvedItem[] = [];
  if (Array.isArray(payment.metadata?.items)) {
    for (const meta of payment.metadata!.items) {
      const resolved = resolveFromCatalog(meta.eventId, meta.photoId);
      if (resolved) items.push(resolved);
    }
  }

  let order: StoredOrder | null = null;
  if (env.ORDERS) {
    const raw = await env.ORDERS.get(`order:${externalReference}`);
    if (raw) order = JSON.parse(raw) as StoredOrder;
  }

  if (!order) {
    order = {
      externalReference,
      status: mappedStatus,
      items,
      total: items.reduce((s, i) => s + i.unitPrice, 0) || payment.transaction_amount || 0,
      createdAt: new Date().toISOString(),
    };
  }

  order.status = mappedStatus;
  order.paymentId = String(payment.id);
  if (items.length) {
    order.items = items;
    order.total = items.reduce((s, i) => s + i.unitPrice, 0);
  }
  if (mappedStatus === 'approved') {
    order.paidAt = new Date().toISOString();
  }

  if (env.ORDERS) {
    await env.ORDERS.put(`order:${externalReference}`, JSON.stringify(order), {
      expirationTtl: 60 * 60 * 24 * 90,
    });
  }

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

function publicOrder(order: StoredOrder) {
  return {
    externalReference: order.externalReference,
    status: order.status,
    total: order.total,
    paidAt: order.paidAt,
    items: order.items.map((item) => ({
      eventId: item.eventId,
      photoId: item.photoId,
      title: item.title,
      unitPrice: item.unitPrice,
      downloadReady: order.status === 'approved',
    })),
    message: statusMessage(order.status),
  };
}

function statusMessage(status: StoredOrder['status']) {
  switch (status) {
    case 'approved':
      return 'Pagamento confirmado. Suas fotos em alta resolução serão liberadas em breve.';
    case 'rejected':
      return 'O pagamento não foi aprovado. Você pode tentar novamente.';
    case 'in_process':
      return 'Pagamento em análise. Assim que confirmar, liberamos as fotos.';
    default:
      return 'Aguardando confirmação do pagamento.';
  }
}
