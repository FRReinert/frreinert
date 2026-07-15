const SPOTIFY_TYPES = ['track', 'album', 'playlist', 'episode', 'show'] as const;
type SpotifyEmbedType = (typeof SPOTIFY_TYPES)[number];

type SpotifyEmbed = {
  type: SpotifyEmbedType;
  id: string;
  /** Spotify URI for the iFrame API (spotify:track:…) */
  uri: string;
  /** Compact dark embed URL ready for iframe src */
  embedSrc: string;
};

function buildEmbed(type: SpotifyEmbedType, id: string): SpotifyEmbed {
  return {
    type,
    id,
    uri: `spotify:${type}:${id}`,
    embedSrc: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`,
  };
}

/**
 * Parse open.spotify.com (or spotify: URI) links into an embed iframe src.
 * Returns null when the URL is missing or not a supported Spotify resource.
 */
export function parseSpotifyUrl(input: string | undefined | null): SpotifyEmbed | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const uri = trimmed.match(/^spotify:(track|album|playlist|episode|show):([A-Za-z0-9]+)$/i);
  if (uri) {
    return buildEmbed(uri[1].toLowerCase() as SpotifyEmbedType, uri[2]);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (!/(^|\.)spotify\.com$/i.test(url.hostname)) return null;

  const path = url.pathname.replace(/^\/intl-[a-z]{2}\b/i, '');
  const match = path.match(
    /^\/(?:embed\/)?(track|album|playlist|episode|show)\/([A-Za-z0-9]+)\/?$/i,
  );
  if (!match) return null;

  return buildEmbed(match[1].toLowerCase() as SpotifyEmbedType, match[2]);
}
