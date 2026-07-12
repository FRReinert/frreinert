/**
 * Upload a local file to R2 bucket frreinert-media via wrangler.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

export const R2_MEDIA_BUCKET = 'frreinert-media';

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

export function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

/**
 * @param {string} localFile
 * @param {string} objectKey  e.g. images/uploads/foo.jpg
 * @param {{ dryRun?: boolean, contentType?: string, bucket?: string }} [opts]
 */
export function putR2Object(localFile, objectKey, opts = {}) {
  const { dryRun = false, bucket = R2_MEDIA_BUCKET } = opts;
  const contentType = opts.contentType || contentTypeFor(localFile);

  if (dryRun) {
    console.log(`[dry-run] put ${bucket}/${objectKey} ← ${path.relative(root, localFile)}`);
    return;
  }

  const result = spawnSync(
    'npx',
    [
      'wrangler',
      'r2',
      'object',
      'put',
      `${bucket}/${objectKey}`,
      `--file=${localFile}`,
      `--content-type=${contentType}`,
      '--remote',
    ],
    {
      cwd: root,
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
