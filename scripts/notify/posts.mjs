#!/usr/bin/env node
/**
 * Envia Web Push (OneSignal) para cada publicação .md *adicionada* no commit.
 * Uso no CI: após deploy, com ONESIGNAL_APP_ID + ONESIGNAL_REST_API_KEY.
 *
 * Local (dry-run):
 *   node scripts/notify/posts.mjs --dry-run src/content/publicacoes/foo.md
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

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const files = args.filter((a) => a !== '--dry-run' && a.endsWith('.md'));

if (files.length === 0) {
  console.log('Nenhuma publicação nova — push não enviado.');
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

function coverUrl(cover) {
  if (!cover || typeof cover !== 'string') return undefined;
  if (cover.startsWith('http://') || cover.startsWith('https://')) return cover;
  const media = (process.env.PUBLIC_MEDIA_BASE || 'https://cdn.frreinert.com.br').replace(
    /\/+$/,
    '',
  );
  return `${media}/${cover.replace(/^\/+/, '')}`;
}

async function sendPush({ title, description, url, image }) {
  const body = {
    app_id: APP_ID,
    target_channel: 'push',
    included_segments: [SEGMENT],
    headings: { en: title, pt: title },
    contents: {
      en: description || 'Nova publicação no fotolog.',
      pt: description || 'Nova publicação no fotolog.',
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
  if (!data?.title) {
    console.warn(`Ignorado (sem frontmatter title): ${file}`);
    continue;
  }

  const slug = slugFromPath(file);
  const url = `${SITE}/publicacoes/${slug}/`;
  const description =
    typeof data.description === 'string' ? data.description.slice(0, 120) : '';

  await sendPush({
    title: data.title,
    description,
    url,
    image: coverUrl(data.cover),
  });
}
