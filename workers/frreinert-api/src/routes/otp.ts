import { emailOtpEmail, sendMail } from '../mail';
import { json } from '../lib/cors';
import {
  EMAIL_PROOF_TTL_SEC,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_SEC,
  type EmailProofRecord,
  type Env,
  type OtpRecord,
} from '../lib/types';
import { isValidEmail, normalizeEmail, randomToken, timingSafeEqual } from '../lib/utils';

export async function handleEmailOtp(request: Request, env: Env, origin: string | null) {
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

export async function handleEmailOtpConfirm(request: Request, env: Env, origin: string | null) {
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
