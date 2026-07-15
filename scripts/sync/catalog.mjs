#!/usr/bin/env node
/**
 * Gera workers/frreinert-api/src/catalog.json a partir de src/content/eventos/*.md
 *
 *   npm run sync-catalog
 *
 * Usado automaticamente ao final de `npm run publish:evento`.
 * Após gerar o catálogo, redeploy do Worker (sem mudar contratos HTTP):
 *   cd workers/frreinert-api && npx wrangler deploy
 *
 * Schema do catalog (não breaking): { events: { [eventId]: { title, photos: { [id]: { title, price, highresKey, preview } } } } }
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const workerDir = path.join(root, 'workers/frreinert-api');
const eventosDir = path.join(root, 'src/content/eventos');
const outFile = path.join(workerDir, 'src/catalog.json');

const require = createRequire(path.join(workerDir, 'package.json'));
const { parse: yamlParse } = require('yaml');

if (!fs.existsSync(eventosDir)) {
  console.error('Pasta de eventos não encontrada:', eventosDir);
  process.exit(1);
}

const catalog = { events: {} };
const files = fs.readdirSync(eventosDir).filter((f) => f.endsWith('.md'));

for (const file of files) {
  const eventId = file.replace(/\.md$/, '');
  const raw = fs.readFileSync(path.join(eventosDir, file), 'utf8');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) continue;
  const data = yamlParse(match[1]);
  const photos = {};
  for (const photo of data.photos || []) {
    if (!photo?.id) continue;
    photos[photo.id] = {
      title: photo.id,
      price: Number(photo.price),
      highresKey: photo.highresKey || null,
      preview: photo.preview || null,
    };
  }
  catalog.events[eventId] = {
    title: data.title || eventId,
    photos,
  };
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Catalogo gerado: ${outFile} (${files.length} evento(s))`);
