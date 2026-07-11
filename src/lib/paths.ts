/** Join a path with Astro `base` (handles missing trailing slash). */
export function withBase(path = '') {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const clean = path.replace(/^\/+/, '');
  if (!clean) return `${base}/`;
  return `${base}/${clean}`;
}

/** Resolve media paths from Decap (`/images/...`) against the site base. */
export function assetUrl(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return withBase(path);
}

export type VideoEmbed =
  | { kind: 'youtube'; id: string }
  | { kind: 'vimeo'; id: string }
  | { kind: 'file'; src: string };

/** Parse YouTube/Vimeo URLs or local video paths into an embed descriptor. */
export function parseVideo(url: string): VideoEmbed {
  const trimmed = url.trim();

  const yt =
    trimmed.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/,
    ) ?? trimmed.match(/youtube\.com\/watch\?.*v=([A-Za-z0-9_-]{6,})/);
  if (yt?.[1]) return { kind: 'youtube', id: yt[1] };

  const vimeo = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo?.[1]) return { kind: 'vimeo', id: vimeo[1] };

  return { kind: 'file', src: assetUrl(trimmed) };
}
