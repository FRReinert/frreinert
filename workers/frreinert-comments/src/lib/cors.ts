const ALLOWED_ORIGINS = [
  'https://frreinert.com.br',
  'https://www.frreinert.com.br',
  'https://frreinert.github.io',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
];

function isAllowedOrigin(origin: string | null): boolean {
  return Boolean(origin && ALLOWED_ORIGINS.includes(origin));
}

export function rejectIfOriginNotAllowed(origin: string | null): Response | null {
  if (!isAllowedOrigin(origin)) {
    return json({ error: 'Origin não permitida.' }, 403, origin);
  }
  return null;
}

export function corsHeaders(origin: string | null): HeadersInit {
  const allowed = isAllowedOrigin(origin);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allowed && origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}
