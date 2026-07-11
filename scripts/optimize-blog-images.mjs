#!/usr/bin/env node
/**
 * Otimiza fotos de alta resolução para upload no admin (Decap).
 * Redimensiona e comprime em JPEG pronto para web — sem gravar no site.
 *
 * Uso:
 *   npm run optimize-images -- --dir ./minhas-fotos
 *   npm run optimize-images -- --dir ./minhas-fotos --out ./prontas
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff']);

function parseArgs(argv) {
  const out = {
    dir: '',
    outDir: '',
    maxEdge: 2048,
    quality: 85,
    dryRun: false,
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
    } else if (arg === '--out') {
      const { value, nextIndex } = takeValue(i);
      out.outDir = value;
      i = nextIndex;
    } else if (arg === '--max-edge') {
      out.maxEdge = Number(argv[++i]);
    } else if (arg === '--quality') {
      out.quality = Number(argv[++i]);
    } else if (arg === '--dry-run') {
      out.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      out.help = true;
    }
  }

  return out;
}

function printHelp() {
  console.log(`
Otimiza imagens para upload no admin do site (JPEG web, sem marca d'água).

  npm run optimize-images -- --dir ./minhas-fotos
  npm run optimize-images -- --dir ./minhas-fotos --out ./prontas

Flags:
  --dir <path>       Pasta com as fotos originais (obrigatório)
  --out <path>       Pasta de saída (default: <dir>/optimized)
  --max-edge <n>     Maior lado em pixels (default: 2048)
  --quality <n>      Qualidade JPEG 40–95 (default: 85)
  --dry-run          Só lista o que faria
  --help             Esta ajuda

Depois: suba os arquivos de --out pelo admin (/admin/) na publicação.
`);
}

function slugifyStem(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'foto';
}

function listImages(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()))
    .filter((name) => !name.startsWith('.'))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function optimizeOne(inputPath, outputPath, { maxEdge, quality, dryRun }) {
  const inputSize = fs.statSync(inputPath).size;

  if (dryRun) {
    console.log(`  [dry-run] ${path.basename(inputPath)} → ${path.basename(outputPath)}`);
    return { inputSize, outputSize: 0 };
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
    `  ${path.basename(inputPath)}  ${formatBytes(inputSize)} → ${formatBytes(outputSize)}  (${path.basename(outputPath)})`,
  );
  return { inputSize, outputSize };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.dir) {
    console.error('Erro: --dir é obrigatório.\n');
    printHelp();
    process.exit(1);
  }

  if (!Number.isFinite(args.maxEdge) || args.maxEdge < 200) {
    console.error('Erro: --max-edge inválido.');
    process.exit(1);
  }
  if (!Number.isFinite(args.quality) || args.quality < 40 || args.quality > 95) {
    console.error('Erro: --quality deve ser entre 40 e 95.');
    process.exit(1);
  }

  const inputDir = path.resolve(root, args.dir);
  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    console.error(`Erro: pasta não encontrada: ${inputDir}`);
    process.exit(1);
  }

  const outDir = path.resolve(root, args.outDir || path.join(args.dir, 'optimized'));
  if (path.resolve(outDir) === path.resolve(inputDir)) {
    console.error('Erro: --out não pode ser a mesma pasta que --dir.');
    process.exit(1);
  }

  const images = listImages(inputDir);
  if (!images.length) {
    console.error(`Erro: nenhuma imagem em ${inputDir}`);
    process.exit(1);
  }

  console.log(`Entrada: ${inputDir} (${images.length} arquivo(s))`);
  console.log(`Saída:   ${outDir}`);
  console.log(`JPEG max ${args.maxEdge}px · qualidade ${args.quality}`);
  if (args.dryRun) console.log('(dry-run)\n');

  if (!args.dryRun) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  let totalIn = 0;
  let totalOut = 0;
  const used = new Set();

  for (const file of images) {
    let stem = slugifyStem(path.parse(file).name);
    let n = 2;
    while (used.has(stem)) {
      stem = `${slugifyStem(path.parse(file).name)}-${n++}`;
    }
    used.add(stem);

    const result = await optimizeOne(
      path.join(inputDir, file),
      path.join(outDir, `${stem}.jpg`),
      args,
    );
    totalIn += result.inputSize;
    totalOut += result.outputSize;
  }

  if (!args.dryRun) {
    console.log(`\nTotal: ${formatBytes(totalIn)} → ${formatBytes(totalOut)}`);
    console.log('Pronto. Envie esses JPEGs pelo admin (/admin/) na publicação.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
