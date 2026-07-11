/**
 * Gateway OAuth GitHub para Decap CMS (GitHub Pages não usa Netlify auth).
 *
 * Deploy:
 *   cd workers/frreinert-decap-oauth && npx wrangler deploy
 * Secrets:
 *   npx wrangler secret put GITHUB_CLIENT_ID
 *   npx wrangler secret put GITHUB_CLIENT_SECRET
 *
 * GitHub OAuth App callback:
 *   https://frreinert-decap-oauth.<sua-subconta>.workers.dev/callback
 */

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

const ALLOWED_POSTMESSAGE_ORIGINS = [
  'https://frreinert.github.io',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
];

const STATE_TTL_MS = 10 * 60 * 1000;

function html(body: string) {
  return new Response(body, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bytesToHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToHex(sig);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function createOAuthState(secret: string) {
  const nonce = crypto.randomUUID();
  const exp = String(Date.now() + STATE_TTL_MS);
  const payload = `${nonce}.${exp}`;
  const sig = await hmacHex(secret, payload);
  return `${payload}.${sig}`;
}

async function verifyOAuthState(secret: string, state: string | null) {
  if (!state) return false;
  const parts = state.split('.');
  if (parts.length !== 3) return false;
  const [nonce, exp, sig] = parts;
  if (!nonce || !exp || !sig) return false;
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs < Date.now()) return false;
  const expected = await hmacHex(secret, `${nonce}.${exp}`);
  return timingSafeEqual(expected, sig);
}

function authSuccessPage(token: string) {
  const tokenJson = JSON.stringify(token);
  const originsJson = JSON.stringify(ALLOWED_POSTMESSAGE_ORIGINS);
  return html(`<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8" /><title>Autorizando…</title></head>
  <body>
    <p>Autorizando Decap CMS…</p>
    <script>
      (function () {
        var token = ${tokenJson};
        var allowed = ${originsJson};
        function receiveMessage(message) {
          if (!message.origin || allowed.indexOf(message.origin) === -1) return;
          window.opener.postMessage(
            'authorization:github:success:' + JSON.stringify({ token: token }),
            message.origin
          );
          window.removeEventListener('message', receiveMessage, false);
        }
        window.addEventListener('message', receiveMessage, false);
        allowed.forEach(function (origin) {
          try { window.opener.postMessage('authorizing:github', origin); } catch (e) {}
        });
      })();
    </script>
  </body>
</html>`);
}

function authErrorPage(message: string) {
  const safe = escapeHtml(message);
  const messageJson = JSON.stringify(message);
  const originsJson = JSON.stringify(ALLOWED_POSTMESSAGE_ORIGINS);
  return html(`<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8" /><title>Erro</title></head>
  <body>
    <p>Falha na autenticação: ${safe}</p>
    <script>
      (function () {
        var allowed = ${originsJson};
        var payload = 'authorization:github:error:' + JSON.stringify({ message: ${messageJson} });
        if (window.opener) {
          allowed.forEach(function (origin) {
            try { window.opener.postMessage(payload, origin); } catch (e) {}
          });
        }
      })();
    </script>
  </body>
</html>`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(
        JSON.stringify({
          ok: true,
          service: 'frreinert-decap-oauth',
          routes: ['GET /auth', 'GET /callback'],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url.pathname === '/auth') {
      const provider = url.searchParams.get('provider');
      if (provider !== 'github') {
        return new Response('Provider inválido', { status: 400 });
      }
      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
        return new Response('OAuth não configurado', { status: 501 });
      }

      const redirectUri = `${url.origin}/callback`;
      const state = await createOAuthState(env.GITHUB_CLIENT_SECRET);
      const authorize = new URL('https://github.com/login/oauth/authorize');
      authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      authorize.searchParams.set('redirect_uri', redirectUri);
      authorize.searchParams.set('scope', 'public_repo,user');
      authorize.searchParams.set('state', state);

      return Response.redirect(authorize.toString(), 302);
    }

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const state = url.searchParams.get('state');

      if (error) return authErrorPage(error);
      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
        return authErrorPage('credenciais OAuth não configuradas');
      }
      if (!(await verifyOAuthState(env.GITHUB_CLIENT_SECRET, state))) {
        return authErrorPage('state inválido ou expirado');
      }
      if (!code) return authErrorPage('código ausente');

      const redirectUri = `${url.origin}/callback`;
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        error?: string;
        error_description?: string;
      };

      if (!tokenRes.ok || !tokenData.access_token) {
        return authErrorPage(tokenData.error_description || tokenData.error || 'token inválido');
      }

      return authSuccessPage(tokenData.access_token);
    }

    return new Response('Not found', { status: 404 });
  },
};
