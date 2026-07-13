/**
 * Web Push via OneSignal (Custom Code / Web SDK v16).
 * Docs: https://documentation.onesignal.com/docs/en/web-sdk-setup
 *
 * SW na raiz + scope `/` — necessário para o SDK completar o opt-in
 * enquanto o visitante está em qualquer página do site.
 */
export const PUSH = {
  /** App ID público (Settings → Keys & IDs). */
  appId: '9809d357-cf6a-4618-85a8-c363132b6154',
  /** Segmento padrão “todos os inscritos” no OneSignal. */
  segment: 'Subscribed Users',
  siteOrigin: 'https://frreinert.com.br',
} as const;

/** App ID efetivo: env sobrescreve (útil p/ app de localhost separado). */
export function onesignalAppId(): string {
  const fromEnv = (import.meta.env.PUBLIC_ONESIGNAL_APP_ID as string | undefined)?.trim();
  return fromEnv || PUSH.appId;
}
