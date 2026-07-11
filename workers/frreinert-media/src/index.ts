/**
 * CDN leve para mídia pública do site (imagens de publicações + áudio).
 * Keys no R2 espelham paths do staging local: images/..., audio/...
 */

export interface Env {
  MEDIA: R2Bucket;
}

const ALLOWED_PREFIXES = ['images/', 'audio/'];

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
};

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    Vary: 'Origin',
  };
}

function contentTypeFor(key: string): string {
  const lower = key.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return 'application/octet-stream';
  return CONTENT_TYPES[lower.slice(dot)] || 'application/octet-stream';
}

function isAllowedKey(key: string): boolean {
  if (!key || key.includes('..')) return false;
  return ALLOWED_PREFIXES.some((p) => key.startsWith(p));
}

function applyObjectHeaders(
  headers: Headers,
  object: R2Object,
  key: string,
  includeContentRange: boolean,
) {
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  // Always override — metadata from put may be missing or wrong for browsers.
  headers.set('Content-Type', contentTypeFor(key));

  if (includeContentRange && object.range && 'offset' in object.range) {
    const offset = object.range.offset ?? 0;
    const length =
      'length' in object.range && typeof object.range.length === 'number'
        ? object.range.length
        : object.size;
    // object.size is the full object size when a range was requested.
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('Content-Length', String(length));
  } else {
    headers.set('Content-Length', String(object.size));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

    if (!isAllowedKey(key)) {
      return new Response('Not Found', { status: 404, headers: corsHeaders(request) });
    }

    const hasRange = request.headers.has('Range');
    const object = await env.MEDIA.get(key, hasRange ? { range: request.headers } : undefined);

    if (!object) {
      return new Response('Not Found', { status: 404, headers: corsHeaders(request) });
    }

    const headers = new Headers();
    applyObjectHeaders(headers, object, key, hasRange);
    for (const [k, v] of Object.entries(corsHeaders(request))) {
      headers.set(k, v);
    }

    const status = hasRange ? 206 : 200;

    if (request.method === 'HEAD') {
      return new Response(null, { status, headers });
    }

    return new Response(object.body, { status, headers });
  },
} satisfies ExportedHandler<Env>;
