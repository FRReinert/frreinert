#!/usr/bin/env node
/**
 * Espelha public/images e public/audio → R2 bucket frreinert-media.
 *
 * Uso:
 *   npm run sync-media
 *   npm run sync-media -- --dry-run
 *   npm run sync-media -- --prune   # sobe e remove binários do Git/working tree
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

/** Keep these in Git (small static assets). */
const KEEP_RELATIVE = new Set([
  'public/images/payment/mastercard.svg',
  'public/images/payment/mercadopago.svg',
  'public/images/payment/pix.svg',
  'public/images/payment/visa.svg',
  'public/images/uploads/.gitkeep',
  'public/images/uploads/placeholder.svg',
  'public/audio/.gitkeep',
]);

const GITIGNORE_BLOCK = `# Heavy media — staged by Decap, then synced to R2 (npm run sync-media -- --prune)
public/images/uploads/**
!public/images/uploads/.gitkeep
!public/images/uploads/placeholder.svg
public/audio/**
!public/audio/.gitkeep
`;

const dryRun = process.argv.includes('--dry-run');
const prune = process.argv.includes('--prune');

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

function ensureGitignore() {
  const gitignorePath = path.join(root, '.gitignore');
  let text = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  if (text.includes('public/images/uploads/**')) {
    console.log('gitignore: entradas de mídia já presentes');
    return;
  }
  if (!text.endsWith('\n')) text += '\n';
  text += `\n${GITIGNORE_BLOCK}`;
  if (dryRun) {
    console.log('[dry-run] append media rules to .gitignore');
    return;
  }
  fs.writeFileSync(gitignorePath, text);
  console.log('gitignore: regras de mídia adicionadas');
}

function shouldPruneLocal(filePath) {
  const rel = path.relative(root, filePath).split(path.sep).join('/');
  if (KEEP_RELATIVE.has(rel)) return false;
  // Only prune CMS uploads + audio binaries (not payment icons etc.)
  if (rel.startsWith('public/images/uploads/')) return true;
  if (rel.startsWith('public/audio/')) return true;
  return false;
}

function pruneLocalAndGit(syncedFiles) {
  ensureGitignore();

  const toRemove = syncedFiles.filter(shouldPruneLocal);
  if (!toRemove.length) {
    console.log('prune: nada para remover');
    return;
  }

  for (const file of toRemove) {
    const rel = path.relative(root, file);
    if (dryRun) {
      console.log(`[dry-run] prune ${rel}`);
      continue;
    }
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`rm   ${rel}`);
    }
  }

  if (dryRun) return;

  const rels = toRemove.map((f) => path.relative(root, f).split(path.sep).join('/'));
  const result = spawnSync('git', ['rm', '-f', '--cached', '--ignore-unmatch', ...rels], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    console.warn(`git rm --cached: ${err || `exit ${result.status}`} (seguindo)`);
  } else {
    console.log(`git: removidos do index (${rels.length} arquivo(s))`);
  }

  console.log('\nPróximo passo: commit da limpeza, ex.:');
  console.log('  git add -A && git commit -m "Prune media from Git after R2 sync"');
}

function main() {
  const synced = [];
  let count = 0;
  for (const { local, keyPrefix } of ROOTS) {
    const files = walkFiles(local);
    for (const file of files) {
      const rel = path.relative(local, file).split(path.sep).join('/');
      const key = `${keyPrefix}/${rel}`;
      putObject(file, key, contentTypeFor(file));
      synced.push(file);
      count += 1;
    }
  }
  console.log(dryRun ? `Dry-run: ${count} arquivo(s).` : `Sync concluído: ${count} arquivo(s) → ${BUCKET}.`);

  if (prune) {
    pruneLocalAndGit(synced);
  }
}

main();
