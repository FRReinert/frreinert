#!/usr/bin/env node
/**
 * Envia Web Push (OneSignal) para cada .md *adicionado* em publicacoes/ ou moments/.
 * Uso no CI: após deploy, com ONESIGNAL_APP_ID + ONESIGNAL_REST_API_KEY.
 *
 * Local (dry-run):
 *   node scripts/notify/posts.mjs --dry-run src/content/publicacoes/foo.md
 *   node scripts/notify/posts.mjs --dry-run src/content/moments/bar.md
 */
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { parse as parseYaml } from 'yaml';

const SITE = process.env.SITE_URL?.replace(/\/+$/, '') || 'https://frreinert.com.br';
/** Produção — mesmo valor de src/lib/site/push.ts (App ID é público). */
const DEFAULT_APP_ID = '9809d357-cf6a-4618-85a8-c363132b6154';
const APP_ID =
  process.env.ONESIGNAL_APP_ID || process.env.PUBLIC_ONESIGNAL_APP_ID || DEFAULT_APP_ID;
const API_KEY = process.env.ONESIGNAL_REST_API_KEY;
const SEGMENT = process.env.ONESIGNAL_SEGMENT || 'Subscribed Users';

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 120;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const files = args.filter((a) => a !== '--dry-run' && a.endsWith('.md'));

if (files.length === 0) {
  console.log('Nenhum conteúdo novo — push não enviado.');
  process.exit(0);
}

if (!dryRun && !API_KEY) {
  console.error('Defina ONESIGNAL_REST_API_KEY para enviar push.');
  process.exit(1);
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  return parseYaml(match[1]);
}

function slugFromPath(filePath) {
  return basename(filePath, extname(filePath));
}

function isMomentPath(filePath) {
  return filePath.replace(/\\/g, '/').includes('/moments/');
}

function coverUrl(path) {
  if (!path || typeof path !== 'string') return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const media = (process.env.PUBLIC_MEDIA_BASE || 'https://cdn.frreinert.com.br').replace(
    /\/+$/,
    '',
  );
  return `${media}/${path.replace(/^\/+/, '')}`;
}

function momentTitle(data) {
  const explicit = typeof data.title === 'string' ? data.title.trim() : '';
  if (explicit) return explicit;

  const firstLine = String(data.text || '')
    .split('\n')[0]
    ?.trim();
  if (!firstLine) return 'Moment';

  return firstLine.length > TITLE_MAX
    ? `${firstLine.slice(0, TITLE_MAX - 1).trim()}…`
    : firstLine;
}

function momentDescription(data) {
  const explicit = typeof data.description === 'string' ? data.description.trim() : '';
  if (explicit) return explicit.slice(0, DESCRIPTION_MAX);

  const flat = String(data.text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!flat) return '';

  return flat.length > DESCRIPTION_MAX ? `${flat.slice(0, DESCRIPTION_MAX - 1).trim()}…` : flat;
}

async function sendPush({ title, description, url, image, fallbackText }) {
  const body = {
    app_id: APP_ID,
    target_channel: 'push',
    included_segments: [SEGMENT],
    headings: { en: title, pt: title },
    contents: {
      en: description || fallbackText,
      pt: description || fallbackText,
    },
    url,
    web_url: url,
    chrome_web_image: image,
    firefox_icon: image,
  };

  if (dryRun) {
    console.log('[dry-run] push', JSON.stringify(body, null, 2));
    return;
  }

  const res = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Key ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OneSignal ${res.status}: ${text}`);
  }
  console.log('Push enviado:', title, text);
}

for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  const data = parseFrontmatter(raw);
  if (!data) {
    console.warn(`Ignorado (frontmatter inválido): ${file}`);
    continue;
  }

  const slug = slugFromPath(file);
  const moment = isMomentPath(file);

  if (moment) {
    if (!String(data.text || '').trim()) {
      console.warn(`Ignorado (sem text): ${file}`);
      continue;
    }

    await sendPush({
      title: momentTitle(data),
      description: momentDescription(data),
      url: `${SITE}/moments/${slug}/`,
      image: coverUrl(data.image),
      fallbackText: 'Fabrício publicou um novo moment.',
    });
    continue;
  }

  if (!data.title) {
    console.warn(`Ignorado (sem title): ${file}`);
    continue;
  }

  const description =
    typeof data.description === 'string' ? data.description.slice(0, DESCRIPTION_MAX) : '';

  await sendPush({
    title: data.title,
    description,
    url: `${SITE}/publicacoes/${slug}/`,
    image: coverUrl(data.cover),
    fallbackText: 'Fabrício fez uma nova publicação.',
  });
}
