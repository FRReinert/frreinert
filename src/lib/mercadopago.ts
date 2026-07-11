/**
 * Cliente do checkout Mercado Pago → Cloudflare Worker.
 */

import type { CheckoutPayload } from './cart';

/** Ajuste se o Worker tiver outro nome no dashboard. */
export const CHECKOUT_API_BASE =
  import.meta.env.PUBLIC_CHECKOUT_API_URL?.replace(/\/$/, '') ||
  'https://frreinert-api.fabricio-reinert.workers.dev';

export type CreatePreferenceResult =
  | { ok: true; initPoint: string; preferenceId: string; externalReference: string }
  | { ok: false; error: string; stub?: true };

export async function createMercadoPagoCheckout(
  payload: CheckoutPayload,
  endpoint = `${CHECKOUT_API_BASE}/api/checkout`,
): Promise<CreatePreferenceResult> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.status === 404) {
      return {
        ok: false,
        stub: true,
        error: 'API não encontrada. Confira PUBLIC_CHECKOUT_API_URL / deploy do Worker.',
      };
    }

    if (res.status === 501) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        stub: true,
        error: data.error || 'Configure MERCADOPAGO_ACCESS_TOKEN no Worker.',
      };
    }

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error || `Erro HTTP ${res.status}` };
    }

    const data = (await res.json()) as {
      initPoint: string;
      preferenceId: string;
      externalReference: string;
    };
    return {
      ok: true,
      initPoint: data.initPoint,
      preferenceId: data.preferenceId,
      externalReference: data.externalReference,
    };
  } catch {
    return {
      ok: false,
      stub: true,
      error: 'Não foi possível contatar a API. Verifique a URL do Worker e o CORS.',
    };
  }
}
