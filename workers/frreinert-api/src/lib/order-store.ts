import { orderApprovedEmail, sendMail } from '../mail';
import { resolveFromCatalog } from './catalog';
import {
  DOWNLOAD_TOKEN_TTL_SEC,
  EMAIL_INDEX_TTL,
  ORDER_PAID_TTL,
  ORDER_PENDING_TTL,
  RATE_WINDOW_SEC,
  type DownloadGrant,
  type EmailIndex,
  type Env,
  type ResolvedItem,
  type SessionRecord,
  type StoredOrder,
} from './types';
import { normalizeEmail, randomToken } from './utils';

export async function isRateLimited(
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

export async function mintDownloadToken(env: Env, grant: Omit<DownloadGrant, 'exp'>): Promise<string> {
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

export async function appendEmailIndex(env: Env, email: string, ref: string) {
  const key = `email:${email}`;
  const raw = await env.ORDERS.get(key);
  const index: EmailIndex = raw ? (JSON.parse(raw) as EmailIndex) : { refs: [] };
  if (!index.refs.includes(ref)) index.refs.push(ref);
  await env.ORDERS.put(key, JSON.stringify(index), { expirationTtl: EMAIL_INDEX_TTL });
}

export async function saveOrder(env: Env, order: StoredOrder, ttl = ORDER_PENDING_TTL) {
  await env.ORDERS.put(`order:${order.externalReference}`, JSON.stringify(order), {
    expirationTtl: ttl,
  });
}

export async function readSession(env: Env, request: Request): Promise<SessionRecord | null> {
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!bearer) return null;

  const raw = await env.ORDERS.get(`session:${bearer}`);
  if (!raw) return null;
  const session = JSON.parse(raw) as SessionRecord;
  if (!session.email || session.exp < Date.now()) return null;
  return session;
}

export async function maybeSendOrderEmail(env: Env, order: StoredOrder) {
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

export function mapMpStatus(status: string): StoredOrder['status'] {
  if (status === 'approved') return 'approved';
  if (status === 'rejected' || status === 'cancelled') return 'rejected';
  if (status === 'in_process' || status === 'pending' || status === 'in_mediation') {
    return 'in_process';
  }
  return 'pending';
}

export async function syncPaymentToOrder(env: Env, paymentId: string): Promise<StoredOrder | null> {
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

export async function publicOrder(
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
