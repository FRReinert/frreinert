#!/usr/bin/env node
/**
 * Migra publicações do WordPress penoestribo.net → src/content/publicacoes/
 * com imagens inline no Markdown apontando ao CDN R2.
 *
 *   node scripts/migrate-penoestribo.mjs [--slug <slug>] [--dry-run] [--skip-upload]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseHtml } from 'node-html-parser';
import TurndownService from 'turndown';
import { stringify as yamlStringify } from 'yaml';
import { optimizeOne, slugifyStem } from './lib/optimize-images.mjs';
import { putR2Object, R2_MEDIA_BUCKET } from './lib/r2-put.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicacoesDir = path.join(root, 'src/content/publicacoes');
const cacheRoot = path.join(root, '.migrate-cache', 'penoestribo');

const WP_ORIGIN = 'https://penoestribo.net';
const CDN_BASE = 'https://cdn.frreinert.com.br';
const SKIP_SLUGS = new Set(['explorando-o-planalto-norte-de-santa-catarina']);
const ENDPOINTS = [
  `${WP_ORIGIN}/wp-json/wp/v2/posts?per_page=100&status=publish`,
  `${WP_ORIGIN}/wp-json/wp/v2/acampamento?per_page=100&status=publish`,
  `${WP_ORIGIN}/wp-json/wp/v2/roteiro?per_page=100&status=publish`,
];

const CROP_RE = /-\d+x\d+(?=\.[a-z]+$)/i;
const SKIP_IMG_RE =
  /cropped-logo|flag-|handshake|logo_penoestribo|payment|woocommerce|mp_rgb/i;

function parseArgs(argv) {
  const out = {
    slug: '',
    dryRun: false,
    skipUpload: false,
    maxEdge: 2048,
    quality: 85,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--slug') out.slug = argv[++i] || '';
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--skip-upload') out.skipUpload = true;
    else if (arg === '--max-edge') out.maxEdge = Number(argv[++i]);
    else if (arg === '--quality') out.quality = Number(argv[++i]);
    else if (arg === '--help' || arg === '-h') out.help = true;
    else {
      console.error(`Flag desconhecida: ${arg}`);
      out.help = true;
    }
  }
  return out;
}

function printHelp() {
  console.log(`
Migra posts do Penoestribo (WP) para publicacoes Astro.

  node scripts/migrate-penoestribo.mjs [--slug <slug>] [--dry-run] [--skip-upload]

  --slug <slug>     Só este post (piloto)
  --dry-run         Sem download/R2/.md (lista ações)
  --skip-upload     Otimiza + escreve .md sem R2
  --max-edge <n>    Default 2048
  --quality <n>     Default 85
`);
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'vng-fotolog-migrate/1.0', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; vng-fotolog-migrate/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function stripHtml(html) {
  return decodeHtmlEntities(html);
}

function cleanDescription(excerptHtml, bodyText, maxLen = 220) {
  let text = stripHtml(excerptHtml || '');
  text = text.replace(/\s+/g, ' ').trim();
  // Drop auto-excerpt that starts with a heading emoji dump
  if (!text || text.length < 40) {
    text = (bodyText || '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_#>`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (text.length > maxLen) {
    const cut = text.slice(0, maxLen);
    const last = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    text = last > 80 ? cut.slice(0, last + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
  }
  return text;
}

function formatWpDate(dateStr) {
  // WP returns local datetime without offset, e.g. 2024-10-07T15:46:00
  if (!dateStr) return new Date().toISOString().replace('Z', '-03:00');
  if (/[Zz]|[+-]\d{2}:\d{2}$/.test(dateStr)) return dateStr;
  return `${dateStr}.000-03:00`;
}

function fullSizeUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(CROP_RE, '');
    return u.toString();
  } catch {
    return url.replace(CROP_RE, '');
  }
}

function isContentImage(url) {
  if (!url || !url.includes('/wp-content/uploads/')) return false;
  if (SKIP_IMG_RE.test(url)) return false;
  return /\.(jpe?g|png|webp|gif)$/i.test(url.split('?')[0]);
}

function extractEntryHtml(pageHtml, fallbackRendered) {
  const rootNode = parseHtml(pageHtml);
  const article = rootNode.querySelector('article');
  let entry = article?.querySelector('.entry-content') || rootNode.querySelector('article .entry-content');
  if (!entry) {
    return fallbackRendered || '';
  }
  // Remove nav/related/comments leftovers if nested
  for (const sel of [
    '.post-navigation',
    '.ast-single-related-posts-wrapper',
    '#comments',
    '.comments-area',
    '.jp-relatedposts',
    'script',
    'style',
    'noscript',
  ]) {
    entry.querySelectorAll(sel).forEach((el) => el.remove());
  }
  return entry.innerHTML;
}

function prepareHtml(rawHtml) {
  const rootNode = parseHtml(`<div id="wrap">${rawHtml}</div>`);
  const wrap = rootNode.querySelector('#wrap');

  // Convert pre.wp-block-verse / callouts to blockquote
  wrap.querySelectorAll('pre').forEach((el) => {
    const text = el.text.trim();
    el.replaceWith(`<blockquote><p>${text}</p></blockquote>`);
  });

  // Font Awesome empty icon links → keep link text
  wrap.querySelectorAll('i.fas, i.fab, i.far, i.fa').forEach((el) => el.remove());

  // Flatten Spectra image blocks: keep figure > img + figcaption
  wrap.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    const srcset = img.getAttribute('srcset') || '';
    let best = src;
    if (srcset) {
      const candidates = srcset
        .split(',')
        .map((p) => p.trim().split(/\s+/)[0])
        .filter(Boolean);
      const full = candidates.find((c) => !CROP_RE.test(c)) || candidates[candidates.length - 1];
      if (full) best = full;
    }
    best = fullSizeUrl(best);
    if (!isContentImage(best)) {
      const figure = img.closest('figure') || img.closest('.wp-block-uagb-image');
      if (figure) figure.remove();
      else img.remove();
      return;
    }
    img.setAttribute('src', best);
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.removeAttribute('decoding');
    img.removeAttribute('loading');
    img.removeAttribute('width');
    img.removeAttribute('height');
    img.removeAttribute('role');
    img.removeAttribute('class');
    const alt = (img.getAttribute('alt') || '').trim();
    const caption =
      img.closest('figure')?.querySelector('figcaption')?.text?.trim() ||
      img.closest('.wp-block-uagb-image')?.querySelector('figcaption, .uagb-image-caption')?.text?.trim() ||
      '';
    if (!alt && caption) img.setAttribute('alt', caption.replace(/\s+/g, ' ').trim());
  });

  // Remove empty figures / leftover captions without images
  wrap.querySelectorAll('figure').forEach((fig) => {
    if (!fig.querySelector('img')) fig.remove();
  });

  // Strip class/style noise
  wrap.querySelectorAll('*').forEach((el) => {
    el.removeAttribute('class');
    el.removeAttribute('style');
    el.removeAttribute('id');
    el.removeAttribute('data-id');
  });

  return wrap.innerHTML;
}

function collectImageUrls(preparedHtml, featuredUrl) {
  const rootNode = parseHtml(`<div>${preparedHtml}</div>`);
  const urls = [];
  const seen = new Set();
  const add = (u) => {
    const full = fullSizeUrl(u);
    if (!isContentImage(full) || seen.has(full)) return;
    seen.add(full);
    urls.push(full);
  };
  if (featuredUrl) add(featuredUrl);
  rootNode.querySelectorAll('img').forEach((img) => add(img.getAttribute('src')));
  return urls;
}

function buildSlugMap(items) {
  const map = new Map();
  for (const item of items) {
    const variants = [
      `${WP_ORIGIN}/${item.slug}/`,
      `${WP_ORIGIN}/${item.slug}`,
      `${WP_ORIGIN}/roteiro/${item.slug}/`,
      `${WP_ORIGIN}/roteiro/${item.slug}`,
      `${WP_ORIGIN}/acampamento/${item.slug}/`,
      `${WP_ORIGIN}/acampamento/${item.slug}`,
      `/${item.slug}/`,
      `/${item.slug}`,
      `/roteiro/${item.slug}/`,
      `/roteiro/${item.slug}`,
      `/acampamento/${item.slug}/`,
      `/acampamento/${item.slug}`,
    ];
    for (const v of variants) map.set(v, item.slug);
  }
  return map;
}

function toAbsoluteWpUrl(href) {
  if (!href) return href;
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  if (href.startsWith('/')) return `${WP_ORIGIN}${href}`;
  return href;
}

function lookupSlug(slugMap, href) {
  if (!href) return null;
  const normalized = href.split('#')[0].split('?')[0];
  return (
    slugMap.get(normalized) ||
    slugMap.get(normalized.replace(/\/$/, '')) ||
    slugMap.get(`${normalized.replace(/\/$/, '')}/`) ||
    null
  );
}

function createTurndown(cdnMap, slugMap) {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  });

  td.addRule('images', {
    filter: 'img',
    replacement(_content, node) {
      const src = fullSizeUrl(node.getAttribute('src') || '');
      const alt = (node.getAttribute('alt') || '').replace(/[[\]]/g, '');
      const cdn = cdnMap.get(src);
      if (!cdn) {
        // skip unknown/unmapped
        return '';
      }
      return `\n\n![${alt}](${CDN_BASE}${cdn})\n\n`;
    },
  });

  td.addRule('figures', {
    filter: 'figure',
    replacement(content) {
      return `\n\n${content.trim()}\n\n`;
    },
  });

  td.addRule('figcaption', {
    filter: 'figcaption',
    replacement(content) {
      const text = content.trim();
      return text ? `\n*${text}*\n` : '';
    },
  });

  td.addRule('links', {
    filter: 'a',
    replacement(content, node) {
      const href = (node.getAttribute('href') || '').trim();
      const text = content.trim() || href;
      if (!href) return text;
      const absolute = toAbsoluteWpUrl(href);
      const mapped = lookupSlug(slugMap, absolute) || lookupSlug(slugMap, href);
      if (mapped) {
        return `[${text}](/publicacoes/${mapped}/)`;
      }
      return `[${text}](${href})`;
    },
  });

  return td;
}

async function downloadFile(url, destPath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; vng-fotolog-migrate/1.0)' },
  });
  if (!res.ok) throw new Error(`Download falhou ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return destPath;
}

function uniqueOutputName(stem, used) {
  let base = slugifyStem(stem);
  let name = `${base}.jpg`;
  let n = 2;
  while (used.has(name)) {
    name = `${base}-${n++}.jpg`;
  }
  used.add(name);
  return name;
}

function buildMarkdown(frontmatter, body) {
  const yaml = yamlStringify(frontmatter, {
    lineWidth: 0,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'QUOTE_DOUBLE',
  }).trimEnd();
  const bodyText = (body || '').replace(/^\n+/, '').replace(/\s+$/, '');
  return `---\n${yaml}\n---\n${bodyText ? `${bodyText}\n` : ''}`;
}

async function loadAllItems() {
  const all = [];
  for (const url of ENDPOINTS) {
    const items = await fetchJson(url);
    for (const item of items) {
      all.push(item);
    }
  }
  return all.filter((item) => item.status === 'publish' && !SKIP_SLUGS.has(item.slug));
}

async function resolveFeaturedUrl(item) {
  const mediaId = item.featured_media;
  if (!mediaId) return '';
  try {
    const media = await fetchJson(`${WP_ORIGIN}/wp-json/wp/v2/media/${mediaId}`);
    return media.source_url || '';
  } catch (err) {
    console.warn(`  aviso: featured media ${mediaId}: ${err.message}`);
    return '';
  }
}

async function migrateOne(item, args, slugMap, globalUsedNames) {
  console.log(`\n═══ ${item.type}: ${item.slug} ═══`);
  const title = stripHtml(item.title?.rendered || item.slug);
  const featuredUrl = await resolveFeaturedUrl(item);

  let pageHtml = '';
  try {
    pageHtml = await fetchText(item.link);
  } catch (err) {
    console.warn(`  scrape falhou (${err.message}), usando content.rendered`);
  }

  const entryRaw = pageHtml
    ? extractEntryHtml(pageHtml, item.content?.rendered || '')
    : item.content?.rendered || '';
  const prepared = prepareHtml(entryRaw);
  const imageUrls = collectImageUrls(prepared, featuredUrl);

  console.log(`  título: ${title}`);
  console.log(`  imagens: ${imageUrls.length}`);
  imageUrls.forEach((u) => console.log(`    - ${u}`));

  const stagingRaw = path.join(cacheRoot, item.slug, 'raw');
  const stagingOpt = path.join(cacheRoot, item.slug, 'opt');
  if (!args.dryRun) {
    fs.mkdirSync(stagingRaw, { recursive: true });
    fs.mkdirSync(stagingOpt, { recursive: true });
  }

  /** @type {Map<string, string>} wpFullUrl → /images/uploads/name.jpg */
  const cdnMap = new Map();
  let coverPath = '';

  for (const url of imageUrls) {
    const pathname = new URL(url).pathname;
    const baseName = path.basename(pathname);
    const stem = path.parse(baseName).name.replace(CROP_RE, '');
    const outName = uniqueOutputName(stem, globalUsedNames);
    const publicPath = `/images/uploads/${outName}`;
    cdnMap.set(url, publicPath);
    // also map cropped variants to same
    if (CROP_RE.test(pathname)) {
      cdnMap.set(url.replace(CROP_RE, ''), publicPath);
    }

    if (args.dryRun) {
      console.log(`  [dry-run] ${baseName} → ${publicPath}`);
      if (!coverPath && featuredUrl && fullSizeUrl(featuredUrl) === fullSizeUrl(url)) {
        coverPath = publicPath;
      }
      if (!coverPath && imageUrls[0] === url) coverPath = publicPath;
      continue;
    }

    const rawPath = path.join(stagingRaw, baseName);
    if (!fs.existsSync(rawPath)) {
      console.log(`  ↓ ${baseName}`);
      await downloadFile(url, rawPath);
    } else {
      console.log(`  cache hit ${baseName}`);
    }

    const optPath = path.join(stagingOpt, outName);
    await optimizeOne(rawPath, optPath, {
      maxEdge: args.maxEdge,
      quality: args.quality,
      dryRun: false,
    });

    const doUpload = !args.skipUpload;
    putR2Object(optPath, `images/uploads/${outName}`, { dryRun: !doUpload });

    if (!coverPath && featuredUrl && fullSizeUrl(featuredUrl) === fullSizeUrl(url)) {
      coverPath = publicPath;
    }
  }

  if (!coverPath) {
    coverPath = cdnMap.values().next().value || '';
  }
  if (!coverPath) {
    throw new Error(`Sem capa para ${item.slug}`);
  }

  // Rebuild prepared HTML img srcs already full-size; turndown uses cdnMap
  const td = createTurndown(cdnMap, slugMap);
  let markdownBody = td.turndown(prepared);
  markdownBody = markdownBody
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  const description = cleanDescription(
    item.excerpt?.rendered || item.uagb_excerpt || '',
    markdownBody,
  );

  const frontmatter = {
    title,
    path_slug: item.slug,
    date: formatWpDate(item.date),
    description,
    cover: coverPath,
    carousel: false,
    gallery: [],
  };

  const md = buildMarkdown(frontmatter, markdownBody);
  const mdPath = path.join(publicacoesDir, `${item.slug}.md`);
  const mdRel = path.relative(root, mdPath).split(path.sep).join('/');

  if (args.dryRun) {
    console.log(`  [dry-run] write ${mdRel}`);
    console.log(`  cover: ${coverPath}`);
    console.log(`  body preview:\n${markdownBody.slice(0, 400)}\n…`);
  } else {
    fs.mkdirSync(publicacoesDir, { recursive: true });
    fs.writeFileSync(mdPath, md, 'utf8');
    console.log(`  wrote ${mdRel}`);
    console.log(`  cover CDN: ${CDN_BASE}${coverPath}`);
  }

  return { slug: item.slug, mdPath, coverPath, imageCount: imageUrls.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  console.log('Penoestribo → publicacoes');
  console.log(`R2: ${R2_MEDIA_BUCKET} via ${CDN_BASE}`);
  if (args.dryRun) console.log('(dry-run)');
  if (args.skipUpload) console.log('(skip-upload)');

  const allItems = await loadAllItems();
  console.log(`Encontrados ${allItems.length} itens (sem stub).`);

  let items = allItems;
  if (args.slug) {
    items = allItems.filter((i) => i.slug === args.slug);
    if (!items.length) {
      console.error(`Slug não encontrado: ${args.slug}`);
      process.exit(1);
    }
  }

  // Full map so internal links rewrite even when migrating a single slug
  const slugMap = buildSlugMap(allItems);
  const globalUsedNames = new Set();

  const results = [];
  for (const item of items) {
    const result = await migrateOne(item, args, slugMap, globalUsedNames);
    results.push(result);
  }

  console.log('\n=== Resumo ===');
  for (const r of results) {
    console.log(`  ${r.slug}: ${r.imageCount} imgs → ${path.basename(r.mdPath)}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
