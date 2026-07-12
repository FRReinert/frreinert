#!/usr/bin/env node
/**
 * Ingere fotos de um **evento** (comércio) a partir de uma pasta local:
 *  - gera preview com marca d'água em public/images/uploads/eventos/{eventId}/
 *  - atualiza src/content/eventos/{eventId}.md
 *  - sobe alta resolução no R2 **privado** `frreinert-photos` (não misturar com frreinert-media)
 *  - sincroniza workers/frreinert-api/src/catalog.json
 *
 * Aliases npm (mesmo script):
 *   npm run publish:evento -- …
 *   npm run ingest-photos -- …
 *
 * NÃO é o fluxo de publicações do blog — esse é:
 *   npm run publish:post -- …
 *
 * Uso:
 *   npm run publish:evento -- --dir ./inbox/casamento-ana-pedro \
 *     --title "Casamento Ana & Pedro" --price 6
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const workerDir = path.join(root, 'workers/frreinert-api');
const eventosDir = path.join(root, 'src/content/eventos');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function parseArgs(argv) {
  const out = {
    dir: '',
    title: '',
    price: 6,
    location: '',
    description: '',
    maxEdge: 800,
    dryRun: false,
    skipR2: false,
    help: false,
  };

  const takeValue = (i) => {
    const parts = [];
    let j = i + 1;
    while (j < argv.length && !argv[j].startsWith('--')) {
      parts.push(argv[j]);
      j++;
    }
    return { value: parts.join(' ').trim(), nextIndex: j - 1 };
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir') {
      const { value, nextIndex } = takeValue(i);
      out.dir = value;
      i = nextIndex;
    } else if (arg === '--title') {
      const { value, nextIndex } = takeValue(i);
      out.title = value;
      i = nextIndex;
    } else if (arg === '--price') {
      out.price = Number(argv[++i]);
    } else if (arg === '--location') {
      const { value, nextIndex } = takeValue(i);
      out.location = value;
      i = nextIndex;
    } else if (arg === '--description') {
      const { value, nextIndex } = takeValue(i);
      out.description = value;
      i = nextIndex;
    } else if (arg === '--max-edge') {
      out.maxEdge = Number(argv[++i]);
    } else if (arg === '--dry-run') {
      out.dryRun = true;
    } else if (arg === '--skip-r2') {
      out.skipR2 = true;
    } else if (arg === '--help' || arg === '-h') {
      out.help = true;
    }
  }
  return out;
}

function usage() {
  console.log(`Ingere fotos de evento (comércio) — NÃO use para publicações do blog.

  npm run publish:evento -- --dir ./inbox/casamento-ana-pedro [opções]
  npm run ingest-photos -- --dir ./inbox/casamento-ana-pedro [opções]

  (Publicações / blog: npm run publish:post)

Opções:
  --dir <pasta>         Pasta com as fotos (obrigatório; nome da pasta = eventId)
  --title <texto>       Título do evento (cria/atualiza markdown)
  --price <número>      Preço padrão por foto (default: 6)
  --location <texto>    Local do evento
  --description <texto> Descrição do evento
  --max-edge <px>       Lado maior do preview com watermark (default: 800)
  --dry-run             Só lista o que seria feito
  --skip-r2             Não sobe altas no R2 privado frreinert-photos
  --help                Esta ajuda

Buckets:
  previews  → public/… (Pages) / CDN público se synced
  highres   → R2 privado frreinert-photos (só download via frreinert-api)

Pós-ingest (se o catálogo mudou):
  npm run sync-catalog   # já roda ao final do ingest (exceto dry-run)
  cd workers/frreinert-api && npx wrangler deploy
`);
}

function slugifyEventId(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function listImages(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }))
    .map((name) => path.join(dir, name));
}

function photoCode(eventId, index) {
  return `${eventId}-${String(index).padStart(3, '0')}`;
}

function watermarkSvg(width, height) {
  const min = Math.min(width, height);
  const brandSize = Math.max(10, Math.round(min * 0.02));
  const tagSize = Math.max(10, Math.round(min * 0.024));
  const sideSize = Math.max(10, Math.round(min * 0.022));
  const cornerSize = Math.max(10, Math.round(min * 0.02));
  const brandY = Math.round(height * 0.94);
  const gridStep = Math.max(48, Math.round(min * 0.11));
  const pillW = Math.max(22, Math.round(min * 0.045));
  const pillH = Math.max(120, Math.round(height * 0.28));
  const pillY = Math.round((height - pillH) / 2);
  const pillR = Math.round(pillW / 2);

  // Linhas diagonais tracejadas (grade)
  const lines = [];
  const diagSpan = width + height;
  for (let i = -diagSpan; i < diagSpan; i += gridStep) {
    lines.push(
      `<line class="grid" x1="${i}" y1="0" x2="${i + height}" y2="${height}" />`,
    );
    lines.push(
      `<line class="grid" x1="${i}" y1="${height}" x2="${i + height}" y2="0" />`,
    );
  }

  // Textos repetidos na grade (estilo da referência)
  const tags = [];
  const cols = 3;
  const rows = 5;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = Math.round(((col + 0.5) / cols) * width);
      const y = Math.round(((row + 0.45) / rows) * height * 0.88);
      tags.push(
        `<text class="tag" text-anchor="middle" x="${x}" y="${y}">#proibido reprodução</text>`,
      );
    }
  }

  const leftPillX = Math.round(width * 0.08);
  const rightPillX = Math.round(width * 0.92) - pillW;
  const sideTextX = (px) => Math.round(px + pillW / 2);
  const sideTextY = Math.round(pillY + pillH / 2);

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          .grid {
            stroke: rgba(255,255,255,0.28);
            stroke-width: 1;
            stroke-dasharray: 5 7;
            fill: none;
          }
          .tag {
            fill: rgba(255,255,255,0.34);
            font-family: Arial, Helvetica, sans-serif;
            font-size: ${tagSize}px;
            font-weight: 500;
          }
          .pill {
            fill: rgba(0, 170, 210, 0.72);
          }
          .side {
            fill: rgba(255,255,255,0.92);
            font-family: Arial, Helvetica, sans-serif;
            font-size: ${sideSize}px;
            font-weight: 600;
            letter-spacing: 0.06em;
          }
          .corner {
            fill: rgba(255,255,255,0.4);
            font-family: Arial, Helvetica, sans-serif;
            font-size: ${cornerSize}px;
            font-weight: 500;
          }
          .brand-shadow {
            fill: rgba(0,0,0,0.4);
            font-family: Georgia, 'Times New Roman', serif;
            font-size: ${brandSize}px;
            font-weight: 500;
          }
          .brand {
            fill: rgba(255,255,255,0.5);
            font-family: Georgia, 'Times New Roman', serif;
            font-size: ${brandSize}px;
            font-weight: 500;
          }
        </style>
      </defs>

      ${lines.join('\n      ')}
      ${tags.join('\n      ')}

      <rect class="pill" x="${leftPillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillR}" ry="${pillR}" />
      <rect class="pill" x="${rightPillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillR}" ry="${pillR}" />
      <text class="side" text-anchor="middle" transform="translate(${sideTextX(leftPillX)},${sideTextY}) rotate(-90)">para uso exclusivo</text>
      <text class="side" text-anchor="middle" transform="translate(${sideTextX(rightPillX)},${sideTextY}) rotate(-90)">para uso exclusivo</text>

      <text class="corner" text-anchor="end" transform="translate(${Math.round(width * 0.92)},${Math.round(height * 0.9)}) rotate(-45)">valorize o fotógrafo</text>

      <text class="brand-shadow" text-anchor="middle" x="${width / 2 + 1}" y="${brandY + 1}">Fabricio Reinert</text>
      <text class="brand" text-anchor="middle" x="${width / 2}" y="${brandY}">Fabricio Reinert</text>
    </svg>
  `);
}

async function makePreview(inputPath, outputPath, maxEdge) {
  // failOn: 'none' tolera JPEG truncado/parcial (comum em cópias do Finder)
  const image = sharp(inputPath, { failOn: 'none', unlimited: true }).rotate();
  const buf = await image
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toBuffer({ resolveWithObject: true });

  const w = buf.info.width;
  const h = buf.info.height;

  await sharp(buf.data)
    .composite([{ input: watermarkSvg(w, h), top: 0, left: 0 }])
    .jpeg({ quality: 72, mozjpeg: true })
    .toFile(outputPath);
}

function readEventMarkdown(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`Frontmatter inválido em ${filePath}`);
  }
  return {
    data: yamlParse(match[1]) || {},
    body: (match[2] || '').replace(/^\n/, ''),
  };
}

function writeEventMarkdown(filePath, data, body) {
  const front = yamlStringify(data, {
    lineWidth: 0,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'PLAIN',
  }).trimEnd();
  const content = `---\n${front}\n---\n\n${body.trimEnd()}\n`;
  fs.writeFileSync(filePath, content);
}

function uploadToR2(localFile, objectKey) {
  const result = spawnSync(
    'npx',
    [
      'wrangler',
      'r2',
      'object',
      'put',
      `frreinert-photos/${objectKey}`,
      `--file=${localFile}`,
      '--content-type=image/jpeg',
      '--remote',
    ],
    {
      cwd: workerDir,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  );

  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(`Falha no upload R2 (${objectKey}): ${err || `exit ${result.status}`}`);
  }
}

function syncCatalog() {
  const result = spawnSync('node', [path.join(root, 'scripts/sync-catalog.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'sync-catalog falhou');
  }
  process.stdout.write(result.stdout || '');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.dir) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const absDir = path.resolve(args.dir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    console.error('Pasta inválida:', absDir);
    process.exit(1);
  }

  if (!Number.isFinite(args.price) || args.price < 0) {
    console.error('--price inválido');
    process.exit(1);
  }

  if (!Number.isFinite(args.maxEdge) || args.maxEdge < 64) {
    console.error('--max-edge inválido');
    process.exit(1);
  }

  const eventId = slugifyEventId(path.basename(absDir));
  if (!eventId) {
    console.error('Não foi possível derivar eventId do nome da pasta');
    process.exit(1);
  }

  const images = listImages(absDir);
  if (!images.length) {
    console.error('Nenhuma imagem jpg/jpeg/png/webp encontrada em', absDir);
    process.exit(1);
  }

  const mdPath = path.join(eventosDir, `${eventId}.md`);
  const existing = readEventMarkdown(mdPath);
  const previewDir = path.join(root, 'public/images/uploads/eventos', eventId);
  const publicPreviewBase = `/images/uploads/eventos/${eventId}`;

  console.log(`Evento: ${eventId}`);
  console.log(`Fotos:  ${images.length}`);
  console.log(`Preview max-edge: ${args.maxEdge}px`);
  if (args.dryRun) console.log('(dry-run)');

  const photosById = new Map();
  for (const photo of existing?.data?.photos || []) {
    if (photo?.id) photosById.set(photo.id, { ...photo });
  }

  const firstPreviewRel = `${publicPreviewBase}/${photoCode(eventId, 1)}.jpg`;
  const failures = [];
  let firstOkPreview = existing?.data?.cover || '';

  for (let i = 0; i < images.length; i++) {
    const inputPath = images[i];
    const code = photoCode(eventId, i + 1);
    const previewRel = `${publicPreviewBase}/${code}.jpg`;
    const previewAbs = path.join(previewDir, `${code}.jpg`);
    const highresKey = `eventos/${eventId}/${code}.jpg`;

    console.log(`\n[${i + 1}/${images.length}] ${path.basename(inputPath)} → ${code}`);

    if (args.dryRun) {
      console.log(`  preview → ${previewRel}`);
      console.log(`  r2      → ${highresKey}`);
      continue;
    }

    try {
      fs.mkdirSync(previewDir, { recursive: true });
      await makePreview(inputPath, previewAbs, args.maxEdge);
      console.log(`  preview ok (${previewRel})`);

      if (!args.skipR2) {
        let uploadPath = inputPath;
        let tempJpeg = null;
        const ext = path.extname(inputPath).toLowerCase();
        if (ext !== '.jpg' && ext !== '.jpeg') {
          tempJpeg = path.join(previewDir, `${code}.highres-temp.jpg`);
          await sharp(inputPath, { failOn: 'none', unlimited: true })
            .rotate()
            .jpeg({ quality: 95, mozjpeg: true })
            .toFile(tempJpeg);
          uploadPath = tempJpeg;
        }

        uploadToR2(uploadPath, highresKey);
        console.log(`  r2 ok (${highresKey})`);
        if (tempJpeg && fs.existsSync(tempJpeg)) fs.unlinkSync(tempJpeg);
      } else {
        console.log('  r2 skipped');
      }

      const prev = photosById.get(code) || {};
      photosById.set(code, {
        id: code,
        preview: previewRel,
        price: Number.isFinite(Number(prev.price)) ? Number(prev.price) : args.price,
        highresKey,
      });
      if (!firstOkPreview) firstOkPreview = previewRel;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ERRO — pulando arquivo: ${message}`);
      failures.push({ file: path.basename(inputPath), code, message });
    }
  }

  if (args.dryRun) {
    console.log('\nDry-run concluído. Nada foi gravado.');
    return;
  }

  if (!photosById.size && failures.length) {
    console.error('\nNenhuma foto foi processada com sucesso.');
    process.exit(1);
  }

  const photos = [...photosById.values()].sort((a, b) =>
    String(a.id).localeCompare(String(b.id), 'en', { numeric: true }),
  );

  const data = {
    title: args.title || existing?.data?.title || eventId,
    date: existing?.data?.date || new Date().toISOString(),
    description:
      args.description ||
      existing?.data?.description ||
      'Seleção de fotos do evento — preview com marca d\'água; alta resolução após o pagamento.',
    cover: firstOkPreview || firstPreviewRel,
    ...(args.location || existing?.data?.location
      ? { location: args.location || existing?.data?.location }
      : {}),
    photos,
  };

  const body =
    existing?.body?.trim() ||
    'Fotos do evento. Previews com marca d\'água; altas no R2 privado.';

  fs.mkdirSync(eventosDir, { recursive: true });
  writeEventMarkdown(mdPath, data, body);
  console.log(`\nMarkdown atualizado: ${path.relative(root, mdPath)}`);

  syncCatalog();

  if (failures.length) {
    console.log(`\nAvisos: ${failures.length} arquivo(s) falharam:`);
    for (const f of failures) {
      console.log(`  - ${f.file} (${f.code}): ${f.message}`);
    }
    console.log('Dica: arquivos "* copy.jpg" do Finder às vezes vêm truncados — use o original.');
  }

  console.log('\nPronto. Próximos passos:');
  console.log('  1. Revisar src/content/eventos/<eventId>.md e previews em public/');
  console.log('  2. git add/commit/push do site (markdown + previews; NÃO highres)');
  console.log('  3. Catálogo já sincronizado neste script; redeploy do Worker API:');
  console.log('       cd workers/frreinert-api && npx wrangler deploy');
  console.log('  (Publicações do blog usam npm run publish:post — bucket frreinert-media.)');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
