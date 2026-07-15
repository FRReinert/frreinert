import catalog from '../catalog.json';
import type { CatalogPhoto, ResolvedItem } from './types';

export function resolveFromCatalog(eventId: string, photoId: string): ResolvedItem | null {
  const event = (catalog as { events: Record<string, { title: string; photos: Record<string, CatalogPhoto> }> })
    .events[eventId];
  const photo = event?.photos?.[photoId];
  if (!event || !photo || !Number.isFinite(photo.price) || photo.price < 0) return null;

  return {
    eventId,
    photoId,
    title: `${event.title} — ${photoId}`.slice(0, 250),
    unitPrice: photo.price,
    highresKey: photo.highresKey || undefined,
    preview: photo.preview || undefined,
  };
}
