import type { CollectionEntry } from 'astro:content';

export const SITE_NAME = 'Fabricio Roberto Reinert';

const AUTHOR = {
  name: 'Fabricio Roberto Reinert',
  url: 'https://frreinert.com.br',
} as const;

export type SeoType = 'website' | 'article';

export type JsonLd = Record<string, unknown> | Record<string, unknown>[];

/** Build an absolute canonical URL from site origin and pathname. */
export function canonicalUrl(site: URL | string, pathname: string): string {
  return new URL(pathname, site).href;
}

/** Ensure image URLs are absolute for OG/Twitter/JSON-LD. */
export function absoluteImageUrl(site: URL | string, image?: string): string | undefined {
  if (!image) return undefined;
  if (image.startsWith('http://') || image.startsWith('https://')) return image;
  const path = image.startsWith('/') ? image : `/${image}`;
  return new URL(path, site).href;
}

export function blogPostingSchema(
  item: CollectionEntry<'publicacoes'>,
  site: URL | string,
  image?: string,
): JsonLd {
  const url = canonicalUrl(site, `/publicacoes/${item.id}/`);
  const imageUrl = absoluteImageUrl(site, image);

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: item.data.title,
    description: item.data.description,
    datePublished: item.data.date.toISOString(),
    ...(imageUrl && { image: imageUrl }),
    author: {
      '@type': 'Person',
      name: AUTHOR.name,
      url: AUTHOR.url,
    },
    publisher: {
      '@type': 'Person',
      name: AUTHOR.name,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
  };
}

export function eventSchema(
  item: CollectionEntry<'eventos'>,
  site: URL | string,
  image?: string,
): JsonLd {
  const url = canonicalUrl(site, `/eventos/${item.id}/`);
  const imageUrl = absoluteImageUrl(site, image);

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: item.data.title,
    description: item.data.description,
    startDate: item.data.date.toISOString(),
    url,
    ...(imageUrl && { image: imageUrl }),
    ...(item.data.location && {
      location: {
        '@type': 'Place',
        name: item.data.location,
      },
    }),
  };
}

export function momentSchema(
  item: CollectionEntry<'moments'>,
  site: URL | string,
  image: string | undefined,
  title: string,
  description: string,
): JsonLd {
  const url = canonicalUrl(site, `/moments/${item.id}/`);
  const imageUrl = absoluteImageUrl(site, image);

  return {
    '@context': 'https://schema.org',
    '@type': 'SocialMediaPosting',
    headline: title,
    description,
    datePublished: item.data.date.toISOString(),
    url,
    ...(imageUrl && { image: imageUrl }),
    author: {
      '@type': 'Person',
      name: AUTHOR.name,
      url: AUTHOR.url,
    },
    publisher: {
      '@type': 'Person',
      name: AUTHOR.name,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
  };
}

export function homeSchema(site: URL | string, description: string): JsonLd {
  const url = canonicalUrl(site, '/');

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url,
      description,
      inLanguage: 'pt-BR',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: AUTHOR.name,
      url,
    },
  ];
}

/** Paths excluded from sitemap (transactional / private / error pages). */
const SITEMAP_EXCLUDED = [
  '/carrinho/',
  '/checkout/',
  '/pedido/',
  '/minhas-fotos/',
  '/minhas-fotos/acesso/',
  '/minhas-fotos/biblioteca/',
  '/404/',
] as const;

export function shouldExcludeFromSitemap(pathname: string): boolean {
  return SITEMAP_EXCLUDED.some((excluded) => pathname === excluded || pathname === excluded.slice(0, -1));
}
