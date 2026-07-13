/**
 * Web Push via OneSignal (Custom Code / Web SDK v16).
 * Docs: https://documentation.onesignal.com/docs/en/web-sdk-setup
 *
 * Disparo automático de “nova publicação”:
 * GitHub Action + scripts/notify-new-posts.mjs
 */
export const PUSH = {
  /** App ID público (Settings → Keys & IDs). */
  appId: '9809d357-cf6a-4618-85a8-c363132b6154',
  /** Segmento padrão “todos os inscritos” no OneSignal. */
  segment: 'Subscribed Users',
  siteOrigin: 'https://frreinert.com.br',
  /**
   * Path relativo (sem barra inicial) — subdirectory recomendado
   * para não conflitar com PWA/outros service workers.
   */
  serviceWorkerPath: 'push/onesignal/OneSignalSDKWorker.js',
  serviceWorkerScope: '/push/onesignal/',
} as const;

/** App ID efetivo: env sobrescreve (útil p/ app de localhost separado). */
export function onesignalAppId(): string {
  const fromEnv = (import.meta.env.PUBLIC_ONESIGNAL_APP_ID as string | undefined)?.trim();
  return fromEnv || PUSH.appId;
}
