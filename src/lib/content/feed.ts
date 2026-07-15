/**
 * Metadados estáveis do feed de publicações.
 * URL canônica: /rss.xml — use isto ao configurar RSS-to-push (OneSignal, etc.).
 */
export const FEED = {
  /** Path relativo ao site (sem barra inicial). */
  path: 'rss.xml',
  title: 'Fabricio Reinert — Publicações',
  description:
    'Novas publicações do fotolog: fotografia, viagens e histórias sem algoritmo.',
  language: 'pt-BR',
} as const;

/** Absolute URL do feed a partir de Astro.site / context.site. */
export function feedUrl(site: URL | string): string {
  return new URL(FEED.path, site).href;
}

/** Link canônico de uma publicação (mesmo path do [...slug]). */
export function publicationLink(id: string): string {
  return `/publicacoes/${id}/`;
}
