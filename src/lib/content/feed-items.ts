import { getCollection } from 'astro:content';
import { withBase } from '../media/paths';
import { momentTitle } from './moments';

export type FeedItemKind = 'publicacao' | 'evento' | 'moment';

export type FeedItem = {
  kind: FeedItemKind;
  id: string;
  date: Date;
  title: string;
  cover: string;
  href: string;
  badge?: string;
};

const KIND_BADGE: Record<FeedItemKind, string> = {
  publicacao: 'Publicação',
  evento: 'Evento',
  moment: 'Momento',
};

function sortByDateDesc(a: FeedItem, b: FeedItem): number {
  return b.date.valueOf() - a.date.valueOf();
}

export async function getAllFeedItems(): Promise<FeedItem[]> {
  const [publicacoes, eventos, moments] = await Promise.all([
    getCollection('publicacoes'),
    getCollection('eventos'),
    getCollection('moments'),
  ]);

  const items: FeedItem[] = [
    ...publicacoes.map((item) => ({
      kind: 'publicacao' as const,
      id: item.id,
      date: item.data.date,
      title: item.data.title,
      cover: item.data.cover,
      href: withBase(`publicacoes/${item.id}/`),
      badge: KIND_BADGE.publicacao,
    })),
    ...eventos.map((item) => ({
      kind: 'evento' as const,
      id: item.id,
      date: item.data.date,
      title: item.data.title,
      cover: item.data.cover,
      href: withBase(`eventos/${item.id}/`),
      badge: KIND_BADGE.evento,
    })),
    ...moments.map((item) => ({
      kind: 'moment' as const,
      id: item.id,
      date: item.data.date,
      title: momentTitle(item),
      cover: item.data.image,
      href: withBase(`moments/${item.id}/`),
      badge: KIND_BADGE.moment,
    })),
  ];

  return items.sort(sortByDateDesc);
}

export async function getRecentFeedItems(count: number): Promise<FeedItem[]> {
  const all = await getAllFeedItems();
  return all.slice(0, count);
}

export async function getFeedItemsByKind(kind: FeedItemKind): Promise<FeedItem[]> {
  const all = await getAllFeedItems();
  return all.filter((item) => item.kind === kind);
}
