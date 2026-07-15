/**
 * API de checkout (Mercado Pago) + webhook + auth por e-mail + download.
 * Preços e highresKey vêm do catálogo server-side (não confiar no cliente).
 *
 * Deploy:
 *   node scripts/sync/catalog.mjs
 *   cd workers/frreinert-api && npx wrangler deploy
 */

import { corsHeaders, json, rejectIfOriginNotAllowed } from './lib/cors';
import type { Env } from './lib/types';
import { handleCheckout } from './routes/checkout';
import { handleDownload } from './routes/download';
import { handleEmailOtp, handleEmailOtpConfirm } from './routes/otp';
import { handleOrderLookup } from './routes/orders';
import {
  handleCreateSession,
  handleMagicLink,
  handleMyOrders,
} from './routes/session';
import { handleWebhook } from './routes/webhook';

export type { Env };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const browserPost =
      request.method === 'POST' && url.pathname !== '/api/webhooks/mercadopago';
    if (browserPost) {
      const originRejected = rejectIfOriginNotAllowed(origin);
      if (originRejected) return originRejected;
    }

    if (url.pathname === '/' && request.method === 'GET') {
      return json(
        {
          ok: true,
          service: 'frreinert-api',
          routes: [
            'POST /api/checkout',
            'POST /api/webhooks/mercadopago',
            'GET /api/orders?ref=...|payment_id=...',
            'GET /api/download?token=...|Authorization+eventId+photoId',
            'POST /api/auth/email-otp',
            'POST /api/auth/email-otp/confirm',
            'POST /api/auth/magic-link',
            'POST /api/auth/session',
            'GET /api/my-orders',
          ],
          mercadopagoConfigured: Boolean(env.MERCADOPAGO_ACCESS_TOKEN),
          webhookSecretConfigured: Boolean(env.MERCADOPAGO_WEBHOOK_SECRET),
          resendConfigured: Boolean(env.RESEND_API_KEY),
          ordersKv: Boolean(env.ORDERS),
          r2: Boolean(env.PHOTOS),
        },
        200,
        origin,
      );
    }

    if (url.pathname === '/api/checkout' && request.method === 'POST') {
      return handleCheckout(request, env, origin);
    }

    if (url.pathname === '/api/webhooks/mercadopago' && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    if (url.pathname === '/api/orders' && request.method === 'GET') {
      return handleOrderLookup(request, env, origin);
    }

    if (url.pathname === '/api/download' && request.method === 'GET') {
      return handleDownload(request, env, origin);
    }

    if (url.pathname === '/api/auth/email-otp' && request.method === 'POST') {
      return handleEmailOtp(request, env, origin);
    }

    if (url.pathname === '/api/auth/email-otp/confirm' && request.method === 'POST') {
      return handleEmailOtpConfirm(request, env, origin);
    }

    if (url.pathname === '/api/auth/magic-link' && request.method === 'POST') {
      return handleMagicLink(request, env, origin);
    }

    if (url.pathname === '/api/auth/session' && request.method === 'POST') {
      return handleCreateSession(request, env, origin);
    }

    if (url.pathname === '/api/my-orders' && request.method === 'GET') {
      return handleMyOrders(request, env, origin);
    }

    return json({ error: 'Not found' }, 404, origin);
  },
};
