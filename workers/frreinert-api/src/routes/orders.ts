import { json } from '../lib/cors';
import { isRateLimited, publicOrder, readSession, syncPaymentToOrder } from '../lib/order-store';
import { RATE_ORDERS_LIMIT, type Env, type StoredOrder } from '../lib/types';
import { clientIp } from '../lib/utils';

export async function handleOrderLookup(request: Request, env: Env, origin: string | null) {
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
