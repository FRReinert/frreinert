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
    'Vary': 'Origin',
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
    const object = await env.MEDIA.get(
      key,
      hasRange ? { range: request.headers, onlyIf: request.headers } : { onlyIf: request.headers },
    );

    if (!object) {
      return new Response('Not Found', { status: 404, headers: corsHeaders(request) });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', contentTypeFor(key));
    }
    for (const [k, v] of Object.entries(corsHeaders(request))) {
      headers.set(k, v);
    }

    if (request.method === 'HEAD') {
      return new Response(null, { status: hasRange ? 206 : 200, headers });
    }

    const status = hasRange ? 206 : 200;
    return new Response(object.body, { status, headers });
  },
} satisfies ExportedHandler<Env>;
