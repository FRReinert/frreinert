/**
 * Web Push via OneSignal (Custom Code / Web SDK v16).
 * Docs: https://documentation.onesignal.com/docs/en/web-sdk-setup
 *
 * SW na raiz + scope `/` — necessário para o SDK completar o opt-in
 * enquanto o visitante está em qualquer página do site.
 */
const DEFAULT_APP_ID = '9809d357-cf6a-4618-85a8-c363132b6154';

/** App ID efetivo: env sobrescreve (útil p/ app de localhost separado). */
export function onesignalAppId(): string {
  const fromEnv = (import.meta.env.PUBLIC_ONESIGNAL_APP_ID as string | undefined)?.trim();
  return fromEnv || DEFAULT_APP_ID;
}
