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

function html(body: string) {
  return new Response(body, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function authSuccessPage(token: string) {
  const payload = JSON.stringify({ token });
  return html(`<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8" /><title>Autorizando…</title></head>
  <body>
    <p>Autorizando Decap CMS…</p>
    <script>
      (function () {
        function receiveMessage(message) {
          window.opener.postMessage(
            'authorization:github:success:${payload}',
            message.origin
          );
          window.removeEventListener('message', receiveMessage, false);
        }
        window.addEventListener('message', receiveMessage, false);
        window.opener.postMessage('authorizing:github', '*');
      })();
    </script>
  </body>
</html>`);
}

function authErrorPage(message: string) {
  return html(`<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8" /><title>Erro</title></head>
  <body>
    <p>Falha na autenticação: ${message}</p>
    <script>
      window.opener && window.opener.postMessage(
        'authorization:github:error:${JSON.stringify({ message })}',
        '*'
      );
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
      if (!env.GITHUB_CLIENT_ID) {
        return new Response('GITHUB_CLIENT_ID não configurado', { status: 501 });
      }

      const redirectUri = `${url.origin}/callback`;
      const authorize = new URL('https://github.com/login/oauth/authorize');
      authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      authorize.searchParams.set('redirect_uri', redirectUri);
      authorize.searchParams.set('scope', 'public_repo,user');
      authorize.searchParams.set('state', crypto.randomUUID());

      return Response.redirect(authorize.toString(), 302);
    }

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      if (error) return authErrorPage(error);
      if (!code) return authErrorPage('código ausente');
      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
        return authErrorPage('credenciais OAuth não configuradas');
      }

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
