#!/usr/bin/env node
/**
 * Espelha public/images e public/audio → R2 bucket frreinert-media.
 *
 * Uso:
 *   npm run sync-media
 *   npm run sync-media -- --dry-run
 *
 * Requer wrangler autenticado (npx wrangler login) na conta que tem o bucket.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const workerDir = path.join(root, 'workers/frreinert-media');
const BUCKET = 'frreinert-media';

const ROOTS = [
  { local: path.join(root, 'public/images'), keyPrefix: 'images' },
  { local: path.join(root, 'public/audio'), keyPrefix: 'audio' },
];

const CONTENT_TYPES = {
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

const dryRun = process.argv.includes('--dry-run');

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

function putObject(localFile, objectKey, contentType) {
  if (dryRun) {
    console.log(`[dry-run] put ${BUCKET}/${objectKey} ← ${path.relative(root, localFile)}`);
    return;
  }

  const result = spawnSync(
    'npx',
    [
      'wrangler',
      'r2',
      'object',
      'put',
      `${BUCKET}/${objectKey}`,
      `--file=${localFile}`,
      `--content-type=${contentType}`,
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
  console.log(`ok  ${objectKey}`);
}

function main() {
  let count = 0;
  for (const { local, keyPrefix } of ROOTS) {
    const files = walkFiles(local);
    for (const file of files) {
      const rel = path.relative(local, file).split(path.sep).join('/');
      const key = `${keyPrefix}/${rel}`;
      putObject(file, key, contentTypeFor(file));
      count += 1;
    }
  }
  console.log(dryRun ? `Dry-run: ${count} arquivo(s).` : `Sync concluído: ${count} arquivo(s) → ${BUCKET}.`);
}

main();
