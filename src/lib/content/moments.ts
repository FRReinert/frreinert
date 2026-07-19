import type { CollectionEntry } from 'astro:content';

export type MomentEntry = CollectionEntry<'moments'>;

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 160;

export function momentTitle(item: MomentEntry): string {
  const explicit = item.data.title?.trim();
  if (explicit) return explicit;

  const firstLine = item.data.text.split('\n')[0]?.trim() ?? '';
  if (!firstLine) return 'Moment';

  return firstLine.length > TITLE_MAX ? `${firstLine.slice(0, TITLE_MAX - 1).trim()}…` : firstLine;
}

export function momentDescription(item: MomentEntry): string {
  const explicit = item.data.description?.trim();
  if (explicit) return explicit;

  const flat = item.data.text.replace(/\s+/g, ' ').trim();
  if (!flat) return 'Moment';

  return flat.length > DESCRIPTION_MAX ? `${flat.slice(0, DESCRIPTION_MAX - 1).trim()}…` : flat;
}

/** Slug for comments KV — avoids collision with publications. */
export function momentCommentSlug(id: string): string {
  return `moment-${id}`;
}
