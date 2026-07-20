export type GoogleMapsEmbedData = {
  /** Link original ou expandido para abrir no Google Maps */
  href: string;
  embedSrc: string;
  title?: string;
  lat?: number;
  lng?: number;
  zoom: number;
};

type ParsedCoords = {
  lat: number;
  lng: number;
  zoom?: number;
  placeName?: string;
};

const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl']);
const GOOGLE_MAPS_HOSTS =
  /^(?:www\.)?(?:google\.(?:com|[a-z]{2,3})|maps\.google\.com)$/i;

function decodePlaceName(raw: string): string {
  return decodeURIComponent(raw.replace(/\+/g, ' '));
}

function parseCoordsFromExpandedUrl(url: string): ParsedCoords | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!GOOGLE_MAPS_HOSTS.test(parsed.hostname)) return null;

  const at = parsed.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+)/);
  const data = parsed.pathname.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);

  const q = parsed.searchParams.get('q');
  const qCoords = q?.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);

  const lat = Number(data?.[1] ?? qCoords?.[1] ?? at?.[1]);
  const lng = Number(data?.[2] ?? qCoords?.[2] ?? at?.[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const zoom = at?.[3] ? Number(at[3]) : undefined;
  const placeMatch = parsed.pathname.match(/\/place\/([^/@?]+)/);
  const placeName = placeMatch ? decodePlaceName(placeMatch[1]) : q && !qCoords ? q : undefined;

  return { lat, lng, zoom, placeName };
}

function buildEmbedSrc(lat: number, lng: number, zoom: number): string {
  const params = new URLSearchParams({
    q: `${lat},${lng}`,
    hl: 'pt-BR',
    z: String(zoom),
    output: 'embed',
  });
  return `https://maps.google.com/maps?${params.toString()}`;
}

function isEmbedUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return pathname.includes('/maps/embed');
  } catch {
    return false;
  }
}

function isAllowedMapsUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    const host = hostname.replace(/^www\./, '');
    return SHORT_HOSTS.has(host) || GOOGLE_MAPS_HOSTS.test(hostname);
  } catch {
    return false;
  }
}

async function expandGoogleMapsUrl(input: string): Promise<string | null> {
  if (!isAllowedMapsUrl(input)) return null;

  let current = input;
  for (let hop = 0; hop < 8; hop += 1) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return null;
    }

    const host = parsed.hostname.replace(/^www\./, '');
    if (!SHORT_HOSTS.has(host) && GOOGLE_MAPS_HOSTS.test(parsed.hostname)) {
      return current;
    }

    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'User-Agent': 'frreinert-static-build/1.0' },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return null;
      current = new URL(location, current).href;
      continue;
    }

    if (res.ok) return res.url;
    return null;
  }

  return null;
}

/** Converte link compartilhado do Google Maps em URL de iframe (build-time). */
export async function resolveGoogleMapsEmbed(
  input: string,
  options?: { zoom?: number },
): Promise<GoogleMapsEmbedData | null> {
  const trimmed = input.trim();
  if (!trimmed || !isAllowedMapsUrl(trimmed)) return null;

  if (isEmbedUrl(trimmed)) {
    return {
      href: trimmed,
      embedSrc: trimmed,
      zoom: options?.zoom ?? 15,
    };
  }

  const expanded = (await expandGoogleMapsUrl(trimmed)) ?? trimmed;
  const coords = parseCoordsFromExpandedUrl(expanded);
  if (!coords) return null;

  const zoom = options?.zoom ?? coords.zoom ?? 15;
  return {
    href: trimmed,
    embedSrc: buildEmbedSrc(coords.lat, coords.lng, zoom),
    title: coords.placeName,
    lat: coords.lat,
    lng: coords.lng,
    zoom,
  };
}

/** Parser síncrono para URLs já expandidas (testes e URLs longas). */
export function parseGoogleMapsUrl(input: string, options?: { zoom?: number }): GoogleMapsEmbedData | null {
  const trimmed = input.trim();
  if (!trimmed || !isAllowedMapsUrl(trimmed)) return null;

  if (isEmbedUrl(trimmed)) {
    return { href: trimmed, embedSrc: trimmed, zoom: options?.zoom ?? 15 };
  }

  const coords = parseCoordsFromExpandedUrl(trimmed);
  if (!coords) return null;

  const zoom = options?.zoom ?? coords.zoom ?? 15;
  return {
    href: trimmed,
    embedSrc: buildEmbedSrc(coords.lat, coords.lng, zoom),
    title: coords.placeName,
    lat: coords.lat,
    lng: coords.lng,
    zoom,
  };
}
