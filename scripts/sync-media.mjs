#!/usr/bin/env node
/**
 * @deprecated Prefer `npm run publish:post` (upload + markdown em um comando).
 * Este script ainda espelha public/images e public/audio → R2 frreinert-media
 * para fluxos legados (upload a partir de public/ + prune). Remoção planejada após cutover (passo 07).
 *
 * Uso:
 *   npm run sync-media
 *   npm run sync-media -- --dry-run
 *   npm run sync-media -- --prune
 *
 * Requer wrangler autenticado (npx wrangler login) na conta que tem o bucket.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { putR2Object, contentTypeFor, R2_MEDIA_BUCKET } from './lib/r2-put.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const BUCKET = R2_MEDIA_BUCKET;

const ROOTS = [
  { local: path.join(root, 'public/images'), keyPrefix: 'images' },
  { local: path.join(root, 'public/audio'), keyPrefix: 'audio' },
];

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

const GITIGNORE_BLOCK = `# Heavy media — prefer npm run publish:post (mídia só no R2)
public/images/uploads/**
!public/images/uploads/.gitkeep
!public/images/uploads/placeholder.svg
public/audio/**
!public/audio/.gitkeep
`;

const dryRun = process.argv.includes('--dry-run');
const prune = process.argv.includes('--prune');

if (!process.argv.includes('--quiet-deprecation')) {
  console.warn(
    '[deprecated] sync-media: use `npm run publish:post` para publicações. Este comando permanece só para legado/prune.\n',
  );
}

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
      putR2Object(file, key, { dryRun, contentType: contentTypeFor(file) });
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
