import type { CollectionEntry } from 'astro:content';
import { getCollection } from 'astro:content';

export type MomentEntry = CollectionEntry<'moments'>;

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 160;

export function sortMomentsByDateDesc(items: MomentEntry[]): MomentEntry[] {
  return [...items].sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getSortedMoments(): Promise<MomentEntry[]> {
  return sortMomentsByDateDesc(await getCollection('moments'));
}

/** Anterior = mais antigo; próximo = mais recente (ordem cronológica). */
export function getMomentNeighbors(
  items: MomentEntry[],
  id: string,
): { older: MomentEntry | null; newer: MomentEntry | null } {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return { older: null, newer: null };

  return {
    older: items[index + 1] ?? null,
    newer: items[index - 1] ?? null,
  };
}

export function momentTitle(item: MomentEntry): string {
  const explicit = item.data.title?.trim();
  if (explicit) return explicit;

  const firstLine = item.data.text.split('\n')[0]?.trim() ?? '';
  if (!firstLine) return 'Momento';

  return firstLine.length > TITLE_MAX ? `${firstLine.slice(0, TITLE_MAX - 1).trim()}…` : firstLine;
}

export function momentDescription(item: MomentEntry): string {
  const explicit = item.data.description?.trim();
  if (explicit) return explicit;

  const flat = item.data.text.replace(/\s+/g, ' ').trim();
  if (!flat) return 'Momento';

  return flat.length > DESCRIPTION_MAX ? `${flat.slice(0, DESCRIPTION_MAX - 1).trim()}…` : flat;
}

/** Slug for comments KV — avoids collision with publications. */
export function momentCommentSlug(id: string): string {
  return `moment-${id}`;
}
