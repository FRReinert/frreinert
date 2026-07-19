#!/usr/bin/env node
/**
 * Publica um Moment: otimiza imagem → R2 → escreve .md (sem binários no Git).
 *
 *   npm run publish:moment -- --image ./foto.jpg --slug meu-slug --text "Linha 1\nLinha 2"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import { optimizeOne, slugifyStem } from '../lib/optimize-images.mjs';
import { putR2Object, R2_MEDIA_BUCKET } from '../lib/r2-put.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const momentsDir = path.join(root, 'src/content/moments');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_MEDIA_BASE = 'https://cdn.frreinert.com.br';

function parseArgs(argv) {
  const out = {
    image: '',
    slug: '',
    text: '',
    textFile: '',
    title: '',
    description: '',
    date: '',
    maxEdge: 2048,
    quality: 85,
    outDir: '',
    dryRun: false,
    skipUpload: false,
    update: false,
    push: false,
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
    if (arg === '--image') {
      const { value, nextIndex } = takeValue(i);
      out.image = value;
      i = nextIndex;
    } else if (arg === '--slug') {
      const { value, nextIndex } = takeValue(i);
      out.slug = value;
      i = nextIndex;
    } else if (arg === '--text') {
      const { value, nextIndex } = takeValue(i);
      out.text = value;
      i = nextIndex;
    } else if (arg === '--text-file') {
      const { value, nextIndex } = takeValue(i);
      out.textFile = value;
      i = nextIndex;
    } else if (arg === '--title') {
      const { value, nextIndex } = takeValue(i);
      out.title = value;
      i = nextIndex;
    } else if (arg === '--description') {
      const { value, nextIndex } = takeValue(i);
      out.description = value;
      i = nextIndex;
    } else if (arg === '--date') {
      const { value, nextIndex } = takeValue(i);
      out.date = value;
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
    } else if (arg === '--skip-upload') {
      out.skipUpload = true;
    } else if (arg === '--update') {
      out.update = true;
    } else if (arg === '--push') {
      out.push = true;
    } else if (arg === '--help' || arg === '-h') {
      out.help = true;
    } else {
      console.error(`Flag desconhecida: ${arg}`);
      out.help = true;
    }
  }

  return out;
}

function printHelp() {
  console.log(`
Publica um Moment: otimiza foto → upload R2 (frreinert-media) → escreve .md

  npm run publish:moment -- \\
    --image ./foto.jpg \\
    --slug por-do-sol \\
    --text "Linha 1 🌅\\nLinha 2" \\
    [--title "..."] [--description "..."] [--date 2026-07-19] \\
    [--text-file ./texto.txt] [--max-edge 2048] [--quality 85] \\
    [--out ./.publish-cache/slug] [--dry-run] [--skip-upload] [--update] [--push]

Flags:
  --image <path>         Imagem original (obrigatório)
  --slug <slug>          a-z, 0-9, hífen (obrigatório); nome do .md
  --text <text>          Texto plano (emojis e \\n ok; sem markdown)
  --text-file <path>     Arquivo de texto (alternativa ao --text)
  --title <text>         Título opcional (fallback: primeira linha do texto)
  --description <text>   Descrição curta opcional (SEO/compartilhar)
  --date <ISO|YYYY-MM-DD> Data (default: agora, offset -03:00)
  --max-edge <n>         Maior lado JPEG (default: 2048)
  --quality <n>          Qualidade JPEG 40–95 (default: 85)
  --out <path>           Cache JPEG intermediário
  --dry-run              Lista ações sem R2 nem .md
  --skip-upload          Otimiza + escreve .md sem R2 (dev)
  --update               Atualiza .md existente
  --push                 git add + commit + push só do .md (opcional)
  --help                 Esta ajuda

Key R2: images/uploads/moments/<slug>.jpg
Mídia NUNCA vai para o Git — só o markdown em src/content/moments/
`);
}

function mediaBase() {
  const fromEnv = process.env.PUBLIC_MEDIA_BASE?.replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  try {
    const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    const m = envExample.match(/^PUBLIC_MEDIA_BASE=(.+)$/m);
    if (m) return m[1].trim().replace(/\/+$/, '');
  } catch {
    /* ignore */
  }
  return DEFAULT_MEDIA_BASE;
}

function readExistingMd(mdPath) {
  if (!fs.existsSync(mdPath)) return null;
  const raw = fs.readFileSync(mdPath, 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`Frontmatter inválido em ${mdPath}`);
  }
  return {
    data: yamlParse(match[1]) || {},
  };
}

function formatDate(input) {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new Error('--date inválida');
    return input.toISOString();
  }
  if (!input) {
    const d = new Date();
    const offsetMs = -3 * 60 * 60 * 1000;
    const local = new Date(d.getTime() + offsetMs);
    return local.toISOString().replace('Z', '-03:00');
  }
  const str = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return `${str}T12:00:00.000-03:00`;
  }
  if (/[Zz]|[+-]\d{2}:\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`--date inválida: ${input}`);
  }
  return d.toISOString();
}

function buildMarkdown(frontmatter) {
  const yaml = yamlStringify(frontmatter, {
    lineWidth: 0,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'BLOCK_LITERAL',
  }).trimEnd();
  return `---\n${yaml}\n---\n`;
}

function gitPushMd(mdRel, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] git add ${mdRel} && commit && push`);
    return;
  }
  const add = spawnSync('git', ['add', '--', mdRel], { cwd: root, encoding: 'utf8' });
  if (add.status !== 0) {
    throw new Error(`git add falhou: ${(add.stderr || add.stdout || '').trim()}`);
  }
  const staged = spawnSync('git', ['diff', '--cached', '--name-only'], {
    cwd: root,
    encoding: 'utf8',
  });
  const stagedFiles = (staged.stdout || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const bad = stagedFiles.filter((f) => /\.(jpe?g|png|webp|gif|mp3|m4a|ogg|wav)$/i.test(f));
  if (bad.length) {
    spawnSync('git', ['reset', 'HEAD', '--', ...bad], { cwd: root });
    throw new Error(`Recusei commitar mídia: ${bad.join(', ')}`);
  }
  const onlyMd = stagedFiles.filter((f) => f === mdRel);
  if (!onlyMd.length) {
    console.warn('Nada novo para commit no .md (talvez já commitado).');
    return;
  }
  const msg = `Publish moment ${path.basename(mdRel, '.md')}`;
  const commit = spawnSync('git', ['commit', '-m', msg], { cwd: root, encoding: 'utf8' });
  if (commit.status !== 0) {
    throw new Error(`git commit falhou: ${(commit.stderr || commit.stdout || '').trim()}`);
  }
  const push = spawnSync('git', ['push'], { cwd: root, encoding: 'utf8' });
  if (push.status !== 0) {
    throw new Error(`git push falhou: ${(push.stderr || push.stdout || '').trim()}`);
  }
  console.log('git: push do .md concluído');
}

function resolveText(args, existing) {
  if (args.textFile) {
    const filePath = path.resolve(root, args.textFile);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Arquivo de texto não encontrado: ${filePath}`);
    }
    return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
  }
  if (args.text) {
    return args.text.replace(/\\n/g, '\n');
  }
  if (args.update && existing?.data?.text) {
    return existing.data.text;
  }
  return '';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.image || !args.slug) {
    console.error('Erro: --image e --slug são obrigatórios.\n');
    printHelp();
    process.exit(1);
  }
  if (!SLUG_RE.test(args.slug)) {
    console.error('Erro: --slug deve ser só a-z, 0-9 e hífen (ex.: por-do-sol).');
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

  const imagePath = path.resolve(root, args.image);
  if (!fs.existsSync(imagePath) || !fs.statSync(imagePath).isFile()) {
    console.error(`Erro: imagem não encontrada: ${imagePath}`);
    process.exit(1);
  }

  const mdPath = path.join(momentsDir, `${args.slug}.md`);
  const mdRel = path.relative(root, mdPath).split(path.sep).join('/');
  const existing = readExistingMd(mdPath);

  if (existing && !args.update && !args.dryRun) {
    console.error(
      `Erro: ${mdRel} já existe. Use --update para sobrescrever, ou outro --slug.`,
    );
    process.exit(1);
  }
  if (!existing && args.update) {
    console.error(`Erro: --update mas ${mdRel} não existe.`);
    process.exit(1);
  }

  const text = resolveText(args, existing);
  if (!text.trim()) {
    console.error('Erro: --text ou --text-file é obrigatório (ou use --update com .md existente).');
    process.exit(1);
  }

  const outDir = path.resolve(root, args.outDir || path.join('.publish-cache', args.slug));
  const outputName = `${slugifyStem(args.slug)}.jpg`;
  const outputPath = path.join(outDir, outputName);
  const r2Key = `images/uploads/moments/${outputName}`;
  const publicPath = `/images/uploads/moments/${outputName}`;

  console.log(`Moment:     ${args.slug}`);
  console.log(`Imagem:     ${imagePath}`);
  console.log(`Cache JPEG: ${outputPath}`);
  console.log(`Markdown:   ${mdRel}`);
  console.log(`R2 bucket:  ${R2_MEDIA_BUCKET}`);
  if (args.dryRun) console.log('(dry-run — sem R2 nem .md)\n');
  if (args.skipUpload) console.log('(skip-upload — sem R2)\n');

  console.log('\n→ Otimizando imagem…');
  if (!args.dryRun) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  await optimizeOne(imagePath, outputPath, {
    maxEdge: args.maxEdge,
    quality: args.quality,
    dryRun: args.dryRun,
  });

  const doUpload = !args.dryRun && !args.skipUpload;
  console.log(`\n→ Upload R2 (${doUpload ? 'remoto' : args.dryRun ? 'dry-run' : 'skipped'})…`);
  putR2Object(outputPath, r2Key, { dryRun: !doUpload });

  const date = formatDate(args.date || (args.update ? existing?.data?.date : '') || '');
  const frontmatter = {
    date,
    image: publicPath,
    text,
  };

  const title = args.title || (args.update ? existing?.data?.title : '');
  if (title?.trim()) frontmatter.title = title.trim();

  const description = args.description || (args.update ? existing?.data?.description : '');
  if (description?.trim()) frontmatter.description = description.trim();

  if (frontmatter.date instanceof Date) {
    frontmatter.date = formatDate(frontmatter.date.toISOString());
  } else if (typeof frontmatter.date !== 'string') {
    frontmatter.date = formatDate(String(frontmatter.date));
  }

  const markdown = buildMarkdown(frontmatter);

  console.log(`\n→ Markdown ${args.dryRun ? '(dry-run)' : ''}…`);
  if (args.dryRun) {
    console.log(`[dry-run] write ${mdRel}`);
    console.log('--- preview ---');
    console.log(markdown.slice(0, 800));
  } else {
    fs.mkdirSync(momentsDir, { recursive: true });
    fs.writeFileSync(mdPath, markdown, 'utf8');
    console.log(`wrote ${mdRel}`);
  }

  const base = mediaBase();
  console.log('\n=== Pronto ===');
  console.log(`Markdown: ${mdRel}`);
  console.log(`Smoke URL: ${base}${publicPath}`);
  console.log('\nPróximos passos:');
  console.log(`  git add ${mdRel}`);
  console.log(`  git commit -m "Publish moment ${args.slug}"`);
  console.log('  git push');
  console.log('Não adicione JPG ao Git — mídia só no R2.');

  if (args.push) {
    console.log('\n→ --push…');
    gitPushMd(mdRel, args.dryRun);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
