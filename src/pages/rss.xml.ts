import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { FEED, feedUrl, publicationLink } from '../lib/feed';
import { assetUrl } from '../lib/paths';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const site = context.site;
  if (!site) {
    throw new Error('astro.config.mjs precisa de `site` para gerar o RSS.');
  }

  const posts = (await getCollection('publicacoes')).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );

  const self = feedUrl(site);

  return rss({
    title: FEED.title,
    description: FEED.description,
    site,
    xmlns: {
      atom: 'http://www.w3.org/2005/Atom',
      media: 'http://search.yahoo.com/mrss/',
    },
    customData: [
      `<language>${FEED.language}</language>`,
      `<atom:link href="${self}" rel="self" type="application/rss+xml" />`,
    ].join(''),
    items: posts.map((post) => {
      const cover = assetUrl(post.data.cover);
      return {
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.date,
        link: publicationLink(post.id),
        // Capa como enclosure + media:content — útil para leitores e RSS-to-push.
        enclosure: {
          url: cover,
          type: coverGuessType(cover),
          length: 0,
        },
        customData: `<media:content url="${escapeXml(cover)}" medium="image" />`,
      };
    }),
  });
}

function coverGuessType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
