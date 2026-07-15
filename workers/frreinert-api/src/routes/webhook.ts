import { maybeSendOrderEmail, syncPaymentToOrder } from '../lib/order-store';
import type { Env } from '../lib/types';
import { timingSafeEqual } from '../lib/utils';

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

export async function handleWebhook(request: Request, env: Env) {
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
    /* query-only */
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
