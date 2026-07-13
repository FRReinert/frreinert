#!/usr/bin/env node
/**
 * Publica uma publicação: otimiza imagens → R2 → escreve .md (sem binários no Git).
 *
 *   npm run publish:post -- --dir ./fotos --slug meu-slug --title "..." --description "..."
 *
 * Contrato: docs/migration/TARGET-PUBLICACOES.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import { assertRealMp3 } from './lib/assert-mp3.mjs';
import { optimizeImagesDir, slugifyStem, toAsciiFilename } from './lib/optimize-images.mjs';
import { putR2Object, R2_MEDIA_BUCKET } from './lib/r2-put.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicacoesDir = path.join(root, 'src/content/publicacoes');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_MEDIA_BASE = 'https://cdn.frreinert.com.br';

function parseArgs(argv) {
  const out = {
    dir: '',
    slug: '',
    title: '',
    description: '',
    date: '',
    audio: '',
    spotify: '',
    carousel: false,
    cover: '',
    body: '',
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
    if (arg === '--dir') {
      const { value, nextIndex } = takeValue(i);
      out.dir = value;
      i = nextIndex;
    } else if (arg === '--slug') {
      const { value, nextIndex } = takeValue(i);
      out.slug = value;
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
    } else if (arg === '--audio') {
      const { value, nextIndex } = takeValue(i);
      out.audio = value;
      i = nextIndex;
    } else if (arg === '--spotify') {
      const { value, nextIndex } = takeValue(i);
      out.spotify = value;
      i = nextIndex;
    } else if (arg === '--cover') {
      const { value, nextIndex } = takeValue(i);
      out.cover = value;
      i = nextIndex;
    } else if (arg === '--body') {
      const { value, nextIndex } = takeValue(i);
      out.body = value;
      i = nextIndex;
    } else if (arg === '--out') {
      const { value, nextIndex } = takeValue(i);
      out.outDir = value;
      i = nextIndex;
    } else if (arg === '--max-edge') {
      out.maxEdge = Number(argv[++i]);
    } else if (arg === '--quality') {
      out.quality = Number(argv[++i]);
    } else if (arg === '--carousel') {
      out.carousel = true;
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
Publica uma publicação: otimiza fotos → upload R2 (frreinert-media) → escreve .md

  npm run publish:post -- \\
    --dir ./minhas-fotos \\
    --slug sao-joao-timbo-2026 \\
    --title "São João de Timbó 2026" \\
    --description "Uma festa tradicional..." \\
    [--date 2026-06-26] [--audio ./faixa.mp3] [--spotify URL] \\
    [--carousel] [--cover foto.jpg] [--body ./corpo.md] \\
    [--max-edge 2048] [--quality 85] [--out ./.publish-cache/slug] \\
    [--dry-run] [--skip-upload] [--update] [--push]

Flags:
  --dir <path>           Pasta com fotos originais (obrigatório)
  --slug <slug>          a-z, 0-9, hífen (obrigatório); nome do .md e path_slug
  --title <text>         Título (obrigatório salvo com --update + .md existente)
  --description <text>   Descrição (idem)
  --date <ISO|YYYY-MM-DD> Data (default: agora, offset -03:00)
  --audio <path>         MP3 real → audio/<nome-ascii>.mp3 no R2
  --spotify <url>        Preview Spotify (áudio próprio tem prioridade no site)
  --carousel             carousel: true
  --cover <filename>     Nome pós-otimização usado como capa (default: 1ª imagem)
  --body <path>          Markdown do corpo
  --max-edge <n>         Maior lado JPEG (default: 2048)
  --quality <n>          Qualidade JPEG 40–95 (default: 85)
  --out <path>           Cache JPEG intermediário (default: .publish-cache/<slug>)
  --dry-run              Lista ações sem R2 nem .md
  --skip-upload          Otimiza + escreve .md sem R2 (dev)
  --update               Atualiza .md existente; title/description opcionais
  --push                 git add + commit + push só do .md (opcional)
  --help                 Esta ajuda

Keys R2: images/uploads/<file>.jpg e audio/<file>.mp3
Mídia NUNCA vai para o Git — só o markdown em src/content/publicacoes/

Contrato: docs/migration/TARGET-PUBLICACOES.md
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
    body: match[2] ?? '',
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

function buildMarkdown(frontmatter, body) {
  const yaml = yamlStringify(frontmatter, {
    lineWidth: 0,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'QUOTE_DOUBLE',
  }).trimEnd();
  const bodyText = (body || '').replace(/^\n+/, '').replace(/\s+$/, '');
  return `---\n${yaml}\n---\n${bodyText ? `${bodyText}\n` : ''}`;
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
  // Refuse if anything else is staged that looks like media
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
  const msg = `Publish publicação ${path.basename(mdRel, '.md')}`;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.dir || !args.slug) {
    console.error('Erro: --dir e --slug são obrigatórios.\n');
    printHelp();
    process.exit(1);
  }
  if (!SLUG_RE.test(args.slug)) {
    console.error('Erro: --slug deve ser só a-z, 0-9 e hífen (ex.: sao-joao-timbo-2026).');
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

  const mdPath = path.join(publicacoesDir, `${args.slug}.md`);
  const mdRel = path.relative(root, mdPath).split(path.sep).join('/');
  const existing = readExistingMd(mdPath);

  if (existing && !args.update && !args.dryRun) {
    console.error(
      `Erro: ${mdRel} já existe. Use --update para sobrescrever mídia/frontmatter, ou outro --slug.`,
    );
    process.exit(1);
  }
  if (!existing && args.update) {
    console.error(`Erro: --update mas ${mdRel} não existe.`);
    process.exit(1);
  }

  const title = args.title || existing?.data?.title;
  const description = args.description || existing?.data?.description;
  if (!title || !description) {
    console.error('Erro: --title e --description são obrigatórios (ou use --update com .md existente).');
    process.exit(1);
  }

  const outDir = path.resolve(
    root,
    args.outDir || path.join('.publish-cache', args.slug),
  );

  console.log(`Publicação: ${args.slug}`);
  console.log(`Fotos:      ${inputDir}`);
  console.log(`Cache JPEG: ${outDir}`);
  console.log(`Markdown:   ${mdRel}`);
  console.log(`R2 bucket:  ${R2_MEDIA_BUCKET}`);
  if (args.dryRun) console.log('(dry-run — sem R2 nem .md)\n');
  if (args.skipUpload) console.log('(skip-upload — sem R2)\n');

  // 1. Optimize
  console.log('\n→ Otimizando imagens…');
  const optimized = await optimizeImagesDir(inputDir, outDir, {
    maxEdge: args.maxEdge,
    quality: args.quality,
    dryRun: args.dryRun,
  });

  let coverName = args.cover?.replace(/^\/+/, '') || '';
  if (coverName && !coverName.endsWith('.jpg')) {
    // allow stem or original-ish name
    const match = optimized.find(
      (o) => o.outputName === coverName || o.outputName === `${coverName}.jpg` || o.original === coverName,
    );
    coverName = match?.outputName || `${slugifyStem(path.parse(coverName).name)}.jpg`;
  }
  if (!coverName) {
    coverName = optimized[0].outputName;
  }
  const coverItem = optimized.find((o) => o.outputName === coverName);
  if (!coverItem) {
    console.error(
      `Erro: --cover "${args.cover}" não encontrado após otimização. Disponíveis: ${optimized
        .map((o) => o.outputName)
        .join(', ')}`,
    );
    process.exit(1);
  }

  const galleryItems = optimized.filter((o) => o.outputName !== coverName);
  const imageKeys = optimized.map((o) => ({
    local: o.outputPath,
    key: `images/uploads/${o.outputName}`,
    publicPath: `/images/uploads/${o.outputName}`,
  }));

  // 2. Audio
  let audioKey = null;
  let audioPublicPath = null;
  let audioLocal = null;
  if (args.audio) {
    audioLocal = path.resolve(root, args.audio);
    assertRealMp3(audioLocal);
    const asciiName = toAsciiFilename(path.basename(audioLocal));
    if (!asciiName.toLowerCase().endsWith('.mp3')) {
      throw new Error('Áudio destino deve terminar em .mp3');
    }
    audioKey = `audio/${asciiName}`;
    audioPublicPath = `/audio/${asciiName}`;
    console.log(`\n→ Áudio OK (MP3): ${path.relative(root, audioLocal)} → ${audioKey}`);
  }

  // 3. Upload R2
  const doUpload = !args.dryRun && !args.skipUpload;
  console.log(`\n→ Upload R2 (${doUpload ? 'remoto' : args.dryRun ? 'dry-run' : 'skipped'})…`);
  for (const img of imageKeys) {
    putR2Object(img.local, img.key, { dryRun: !doUpload });
  }
  if (audioKey && audioLocal) {
    putR2Object(audioLocal, audioKey, { dryRun: !doUpload, contentType: 'audio/mpeg' });
  }

  // 4. Frontmatter + body
  const date = formatDate(args.date || (args.update ? existing?.data?.date : '') || '');
  const bodyFromFile = args.body
    ? fs.readFileSync(path.resolve(root, args.body), 'utf8')
    : null;
  const body =
    bodyFromFile !== null ? bodyFromFile : args.update && existing ? existing.body : '';

  const frontmatter = {
    title,
    path_slug: args.slug,
    date,
    description,
    cover: coverItem ? `/images/uploads/${coverName}` : existing?.data?.cover,
    carousel: args.carousel || Boolean(existing?.data?.carousel),
    gallery: galleryItems.map((o) => `/images/uploads/${o.outputName}`),
  };

  if (audioPublicPath) {
    frontmatter.audio_file = audioPublicPath;
  } else if (args.update && existing?.data?.audio_file && !args.audio) {
    frontmatter.audio_file = existing.data.audio_file;
  }

  const spotify = args.spotify || (args.update ? existing?.data?.spotify_url : '');
  if (spotify) {
    frontmatter.spotify_url = spotify;
  }

  if (args.update && existing?.data?.videos?.length && !args.dryRun) {
    frontmatter.videos = existing.data.videos;
  }

  // Normalize date to string for yaml (Date objects from parse)
  if (frontmatter.date instanceof Date) {
    frontmatter.date = formatDate(frontmatter.date.toISOString());
  } else if (typeof frontmatter.date !== 'string') {
    frontmatter.date = formatDate(String(frontmatter.date));
  }

  const markdown = buildMarkdown(frontmatter, body);

  console.log(`\n→ Markdown ${args.dryRun ? '(dry-run)' : ''}…`);
  if (args.dryRun) {
    console.log(`[dry-run] write ${mdRel}`);
    console.log('--- preview frontmatter ---');
    console.log(markdown.split('---\n').slice(0, 3).join('---\n').slice(0, 800));
  } else {
    fs.mkdirSync(publicacoesDir, { recursive: true });
    fs.writeFileSync(mdPath, markdown, 'utf8');
    console.log(`wrote ${mdRel}`);
  }

  // 5. Summary
  const base = mediaBase();
  console.log('\n=== Pronto ===');
  console.log(`Markdown: ${mdRel}`);
  console.log('Smoke URLs:');
  console.log(`  ${base}/images/uploads/${coverName}`);
  if (audioKey) console.log(`  ${base}/${audioKey}`);
  console.log('\nPróximos passos:');
  console.log(`  git add ${mdRel}`);
  console.log(`  git commit -m "Publish ${args.slug}"`);
  console.log('  git push');
  console.log('Não adicione JPG/MP3 ao Git — mídia só no R2.');

  if (args.push) {
    console.log('\n→ --push…');
    gitPushMd(mdRel, args.dryRun);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
