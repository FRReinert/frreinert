#!/usr/bin/env node
/**
 * Otimiza fotos de alta resolução para JPEG web (sem marca d'água).
 * Utilitário fino — para publicar no site use: npm run publish:post
 *
 * Uso:
 *   npm run optimize-images -- --dir ./minhas-fotos
 *   npm run optimize-images -- --dir ./minhas-fotos --out ./prontas
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimizeImagesDir } from './lib/optimize-images.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

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
Otimiza imagens para JPEG web (sem marca d'água).

  npm run optimize-images -- --dir ./minhas-fotos
  npm run optimize-images -- --dir ./minhas-fotos --out ./prontas

Flags:
  --dir <path>       Pasta com as fotos originais (obrigatório)
  --out <path>       Pasta de saída (default: <dir>/optimized)
  --max-edge <n>     Maior lado em pixels (default: 2048)
  --quality <n>      Qualidade JPEG 40–95 (default: 85)
  --dry-run          Só lista o que faria
  --help             Esta ajuda

Para publicar no site (R2 + markdown), prefira:
  npm run publish:post -- --dir … --slug … --title … --description …
`);
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

  console.log(`Entrada: ${inputDir}`);
  console.log(`Saída:   ${outDir}`);
  console.log(`JPEG max ${args.maxEdge}px · qualidade ${args.quality}`);
  if (args.dryRun) console.log('(dry-run)\n');

  await optimizeImagesDir(inputDir, outDir, args);

  if (!args.dryRun) {
    console.log('\nPronto. Para publicar: npm run publish:post -- --dir … --slug …');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
