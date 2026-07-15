/** Join a path with Astro `base` (handles missing trailing slash). */
export function withBase(path = '') {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const clean = path.replace(/^\/+/, '');
  if (!clean) return `${base}/`;
  return `${base}/${clean}`;
}

const MEDIA_PREFIXES = ['images/', 'audio/'];
/** Ícones de pagamento versionados em Pages (`public/images/payment/`), não no R2. */
const LOCAL_MEDIA_PREFIXES = ['images/payment/'];

function isRemoteMediaPath(path: string): boolean {
  const p = path.replace(/^\/+/, '');
  if (LOCAL_MEDIA_PREFIXES.some((prefix) => p.startsWith(prefix))) return false;
  return MEDIA_PREFIXES.some((prefix) => p.startsWith(prefix));
}

/**
 * Resolve media paths from content (`/images/...`, `/audio/...`).
 * When PUBLIC_MEDIA_BASE is set (R2 CDN público), uploads/áudio vão para o CDN;
 * `images/payment/` e demais paths ficam no site base (GitHub Pages / public).
 */
export function assetUrl(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;

  const mediaBase = (import.meta.env.PUBLIC_MEDIA_BASE as string | undefined)?.replace(/\/+$/, '');
  if (mediaBase && isRemoteMediaPath(path)) {
    const clean = path.replace(/^\/+/, '');
    return `${mediaBase}/${clean}`;
  }

  return withBase(path);
}

type VideoEmbed =
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
