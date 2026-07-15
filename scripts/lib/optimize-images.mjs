/**
 * Shared image optimization helpers (JPEG web, no watermark).
 * Used by optimize-blog-images.mjs and scripts/publish/post.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff']);

export function slugifyStem(name) {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'foto'
  );
}

/** ASCII filename for uploads (stem + extension). Warns when renamed. */
export function toAsciiFilename(originalName, { log = console.log } = {}) {
  const ext = path.extname(originalName).toLowerCase();
  const stem = slugifyStem(path.parse(originalName).name);
  const next = `${stem}${ext}`;
  if (next !== originalName) {
    log(`  rename ASCII: ${originalName} → ${next}`);
  }
  return next;
}

export function listImages(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()))
    .filter((name) => !name.startsWith('.'))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Optimize one image to JPEG at outputPath.
 * @returns {{ inputSize: number, outputSize: number, outputName: string }}
 */
export async function optimizeOne(inputPath, outputPath, { maxEdge, quality, dryRun }) {
  const inputSize = fs.statSync(inputPath).size;
  const outputName = path.basename(outputPath);

  if (dryRun) {
    console.log(`  [dry-run] ${path.basename(inputPath)} → ${outputName}`);
    return { inputSize, outputSize: 0, outputName };
  }

  await sharp(inputPath, { failOn: 'none', unlimited: true })
    .rotate()
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality, mozjpeg: true })
    .toFile(outputPath);

  const outputSize = fs.statSync(outputPath).size;
  console.log(
    `  ${path.basename(inputPath)}  ${formatBytes(inputSize)} → ${formatBytes(outputSize)}  (${outputName})`,
  );
  return { inputSize, outputSize, outputName };
}

/**
 * Optimize all images in inputDir → outDir as unique ASCII .jpg names.
 * @returns {Promise<Array<{ original: string, outputPath: string, outputName: string }>>}
 */
export async function optimizeImagesDir(inputDir, outDir, { maxEdge, quality, dryRun }) {
  const images = listImages(inputDir);
  if (!images.length) {
    throw new Error(`Nenhuma imagem em ${inputDir}`);
  }

  if (!dryRun) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const used = new Set();
  const results = [];
  let totalIn = 0;
  let totalOut = 0;

  for (const file of images) {
    const rawStem = slugifyStem(path.parse(file).name);
    let stem = rawStem;
    let n = 2;
    while (used.has(stem)) {
      stem = `${rawStem}-${n++}`;
    }
    used.add(stem);

    if (stem !== path.parse(file).name || path.extname(file).toLowerCase() !== '.jpg') {
      const origStem = path.parse(file).name;
      if (slugifyStem(origStem) !== origStem || path.extname(file).toLowerCase() !== '.jpg') {
        console.log(`  rename ASCII: ${file} → ${stem}.jpg`);
      }
    }

    const outputName = `${stem}.jpg`;
    const outputPath = path.join(outDir, outputName);
    const result = await optimizeOne(path.join(inputDir, file), outputPath, {
      maxEdge,
      quality,
      dryRun,
    });
    totalIn += result.inputSize;
    totalOut += result.outputSize;
    results.push({
      original: file,
      outputPath: dryRun ? outputPath : outputPath,
      outputName,
    });
  }

  if (!dryRun) {
    console.log(`Total imagens: ${formatBytes(totalIn)} → ${formatBytes(totalOut)}`);
  }

  return results;
}
