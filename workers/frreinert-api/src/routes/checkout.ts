import { resolveFromCatalog } from '../lib/catalog';
import { json } from '../lib/cors';
import { appendEmailIndex, saveOrder } from '../lib/order-store';
import {
  ORDER_PENDING_TTL,
  type CheckoutRequest,
  type EmailProofRecord,
  type Env,
  type ResolvedItem,
  type StoredOrder,
} from '../lib/types';
import { isValidEmail, normalizeEmail } from '../lib/utils';

export async function handleCheckout(request: Request, env: Env, origin: string | null) {
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
