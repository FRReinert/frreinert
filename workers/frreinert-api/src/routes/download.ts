import { resolveFromCatalog } from '../lib/catalog';
import { corsHeaders, json } from '../lib/cors';
import { isRateLimited, readSession } from '../lib/order-store';
import { RATE_DOWNLOAD_LIMIT, type DownloadGrant, type EmailIndex, type Env, type StoredOrder } from '../lib/types';
import { clientIp, normalizeEmail, safeFilename } from '../lib/utils';

export async function handleDownload(request: Request, env: Env, origin: string | null) {
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
