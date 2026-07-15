import { magicLinkEmail, sendMail } from '../mail';
import { json } from '../lib/cors';
import { publicOrder } from '../lib/order-store';
import {
  MAGIC_TTL_SEC,
  SESSION_TTL_SEC,
  type EmailIndex,
  type Env,
  type MagicRecord,
  type SessionRecord,
  type StoredOrder,
} from '../lib/types';
import { isValidEmail, normalizeEmail, randomToken } from '../lib/utils';

export async function handleMagicLink(request: Request, env: Env, origin: string | null) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return json({ error: 'JSON inválido' }, 400, origin);
  }

  const email = normalizeEmail(body?.email || '');
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

export async function handleCreateSession(request: Request, env: Env, origin: string | null) {
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

export async function handleMyOrders(request: Request, env: Env, origin: string | null) {
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!bearer) {
    return json({ error: 'Sessão inválida ou expirada.' }, 401, origin);
  }

  const raw = await env.ORDERS.get(`session:${bearer}`);
  if (!raw) {
    return json({ error: 'Sessão inválida ou expirada.' }, 401, origin);
  }
  const session = JSON.parse(raw) as SessionRecord;
  if (!session.email || session.exp < Date.now()) {
    return json({ error: 'Sessão inválida ou expirada.' }, 401, origin);
  }

  const indexRaw = await env.ORDERS.get(`email:${session.email}`);
  const refs: string[] = indexRaw ? (JSON.parse(indexRaw) as EmailIndex).refs : [];
  const workerOrigin = new URL(request.url).origin;

  const orders = [];
  for (const ref of refs) {
    const orderRaw = await env.ORDERS.get(`order:${ref}`);
    if (!orderRaw) continue;
    const order = JSON.parse(orderRaw) as StoredOrder;
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
