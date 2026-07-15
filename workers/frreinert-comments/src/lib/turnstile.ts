import type { Env } from './types';

type TurnstileVerifyResult = {
  success: boolean;
};

export async function verifyTurnstile(
  env: Env,
  token: string,
  ip: string,
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;

  if (!token) return false;

  const body = new URLSearchParams({
    secret,
    response: token,
    remoteip: ip,
  });

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) return false;

  const data = (await res.json().catch(() => null)) as TurnstileVerifyResult | null;
  return Boolean(data?.success);
}
