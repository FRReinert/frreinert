#!/usr/bin/env node
/**
 * Bootstrap local Cursor/agent files (gitignored).
 * Run: npm run setup:agents
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const files = {
  'AGENTS.md': `# vng-fotolog — guia para agentes

Site estático Astro 7 em \`https://frreinert.com.br\`. Conteúdo via CLI; comércio e comentários via Cloudflare Workers; mídia em R2.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Frontend | Astro 7, Tailwind v4, output estático |
| Deploy | GitHub Actions → GitHub Pages (\`dist/\`) |
| Mídia pública | R2 \`frreinert-media\` → CDN \`cdn.frreinert.com.br\` |
| Fotos à venda | R2 privado \`frreinert-photos\` + Worker \`frreinert-api\` |
| Comentários | Worker \`frreinert-comments\` (KV + Turnstile) |

Node \`>=22.12.0\`. Sem SSR, sem CMS web.

## Estrutura

\`\`\`text
src/content/{publicacoes,eventos,moments}/   # Markdown versionado
src/pages/                                   # Rotas Astro (trailing slash)
src/lib/{commerce,content,media,site}/       # Lógica compartilhada
scripts/publish/                             # CLI de publicação
workers/frreinert-api/                       # Checkout, OTP, download
workers/frreinert-comments/                  # API de comentários
docs/                                        # Playbooks operacionais (fonte de verdade)
\`\`\`

## Comandos essenciais

\`\`\`sh
npm install && cp .env.example .env
npm run dev              # http://localhost:4321/
npm run dev:fresh        # limpa .astro/ se content layer desatualizar
npm run build
\`\`\`

### Publicar conteúdo

| Tarefa | Comando | Doc |
| --- | --- | --- |
| Post do blog | \`npm run publish:post -- --dir … --slug … --title … --description …\` | \`docs/PUBLICACOES.md\` |
| Moment | \`npm run publish:moment -- --image … --slug … --text …\` | \`docs/MOMENTS.md\` |
| Evento (venda) | \`npm run publish:evento -- --dir … --title … --price …\` | \`docs/COMMERCE.md\` |

Depois de eventos: \`npm run sync-catalog\` e \`cd workers/frreinert-api && npx wrangler deploy\`.

## Regras críticas

1. **Git só versiona \`.md\`** de conteúdo — nunca JPG/MP3 de posts/moments (\`public/images/uploads/**\`, \`public/audio/**\` estão no gitignore).
2. **Dois buckets R2** — \`frreinert-media\` (público/CDN) vs \`frreinert-photos\` (privado/comércio). Não misturar fluxos.
3. **Preços no servidor** — \`catalog.json\` no Worker; nunca confiar em preço do client.
4. **Slugs** — só \`a-z\`, \`0-9\`, hífen.
5. **Trailing slash** em todas as rotas (\`astro.config.mjs\`).
6. **Moments** — texto plano (sem markdown); comentários usam slug \`moment-<slug>\`.
7. **Secrets** — \`.env\`, \`.dev.vars\`, tokens Wrangler nunca no Git.

## Variáveis (\`.env.example\`)

- \`PUBLIC_MEDIA_BASE\` — CDN R2 (obrigatório para ver mídia local)
- \`PUBLIC_COMMENTS_API_URL\`, \`PUBLIC_TURNSTILE_SITE_KEY\`, \`PUBLIC_ONESIGNAL_APP_ID\` — overrides opcionais

## Onde ler antes de agir

- Conteúdo/blog: \`docs/PUBLICACOES.md\`
- Moments: \`docs/MOMENTS.md\`
- Comércio/eventos: \`docs/COMMERCE.md\`
- Web Push: \`docs/PUSH.md\`
- README: visão geral e índice de scripts

## Anti-patterns

- Commitar binários de mídia para “fazer funcionar”
- Editar \`catalog.json\` à mão em fluxo normal (usar \`sync-catalog\`)
- Assumir SSR ou rotas API no Astro (site 100% estático)
- Usar Worker antigo \`*.workers.dev\` como \`PUBLIC_MEDIA_BASE\`
`,

  '.cursorignore': `# Gerado por npm run setup:agents — local, gitignored
dist/
.astro/
node_modules/
workers/**/node_modules/
workers/**/.wrangler/
.publish-cache/
.migrate-cache/
public/images/uploads/**
public/audio/**
.git/
package-lock.json
workers/**/package-lock.json
`,

  '.cursor/rules/project-core.mdc': `---
description: Contexto geral do vng-fotolog (Astro + R2 + Workers)
alwaysApply: true
---

# vng-fotolog

Site estático Astro 7 para frreinert.com.br. Deploy via GitHub Pages.

## Antes de editar

- Ler \`docs/\` relevante (PUBLICACOES, MOMENTS, COMMERCE, PUSH)
- \`npm run dev\` com \`.env\` (\`PUBLIC_MEDIA_BASE\`) para mídia R2
- Content layer desatualizado → \`npm run dev:fresh\`

## Nunca

- Commitar JPG/MP3 de posts/moments
- Confiar em preço do browser (Worker + catalog.json)
- Misturar bucket público (\`frreinert-media\`) com privado (\`frreinert-photos\`)

## Convenções

- Slugs: \`a-z0-9-\` apenas
- Rotas com trailing slash
- Prefixo \`frreinert-\` em Workers, storage keys, localStorage
- UI e docs em português; código pode ter comentários em PT
- Escopo mínimo: não refatorar código não relacionado à tarefa
`,

  '.cursor/rules/astro-content.mdc': `---
description: Astro, content collections e componentes do site
globs: src/**/*
alwaysApply: false
---

# Astro + conteúdo

## Collections (\`src/content.config.ts\`)

| Collection | Uso |
| --- | --- |
| \`publicacoes\` | Blog: gallery, audio_file, spotify_url, carousel |
| \`eventos\` | Venda de fotos: photos[].preview, price, highresKey |
| \`moments\` | 1 imagem + texto plano (sem markdown) |

Páginas usam \`getCollection()\` e rotas \`[...slug].astro\`.
Feed unificado: \`src/lib/content/feed-items.ts\`.

## Mídia

- \`assetUrl()\` em \`src/lib/media/paths.ts\` resolve paths com \`PUBLIC_MEDIA_BASE\`
- Previews de eventos em \`public/images/uploads/eventos/\` (gitignored)
- Ícones de pagamento ficam em \`public/images/payment/\` (versionados)

## Layout

- \`ProfileShell\` + \`ProfileNav\` para seções do perfil
- Tailwind v4 via \`src/styles/global.css\` (@theme tokens: paper, ink, accent)
- SEO: \`src/lib/site/seo.ts\`, sitemap filtra rotas privadas

## Ao criar conteúdo

Preferir CLI (\`publish:post\`, \`publish:moment\`, \`publish:evento\`) em vez de editar mídia manualmente.
`,

  '.cursor/rules/workers.mdc': `---
description: Cloudflare Workers (API e comentários)
globs: workers/**/*
alwaysApply: false
---

# Workers

## frreinert-api

Checkout Mercado Pago, OTP e-mail, webhook, download de alta, magic link "Minhas fotos".

- Catálogo: \`src/catalog.json\` — gerado por \`npm run sync-catalog\`, não editar manualmente em fluxo normal
- R2 \`PHOTOS\` → bucket privado \`frreinert-photos\`
- KV \`ORDERS\` → pedidos

Deploy: \`cd workers/frreinert-api && npx wrangler deploy\`

Secrets: \`MERCADOPAGO_ACCESS_TOKEN\`, \`MERCADOPAGO_WEBHOOK_SECRET\`, \`RESEND_API_KEY\`

## frreinert-comments

KV \`COMMENTS\`, chave \`comments:<slug>\` (moments: \`moment-<slug>\`).

Turnstile + honeypot + rate limit no POST.
Moderação manual via \`wrangler kv\`.

Deploy: \`cd workers/frreinert-comments && npx wrangler deploy\`

## Padrões

- CORS + checagem de Origin em POST
- Preço/highresKey resolvidos server-side
- URLs de produção hardcoded no frontend; override via \`PUBLIC_*_API_URL\`
`,

  '.cursor/rules/publish-cli.mdc': `---
description: Scripts CLI de publicação e sync
globs: scripts/**/*
alwaysApply: false
---

# Scripts de publicação

## publish:post

Otimiza JPEG → upload R2 \`frreinert-media\` → escreve \`src/content/publicacoes/<slug>.md\`.

Flags comuns: \`--dry-run\`, \`--skip-upload\`, \`--update\`, \`--push\`, \`--audio\`, \`--carousel\`.

## publish:moment

1 imagem → R2 → \`src/content/moments/<slug>.md\`. Texto plano; \`--text-file\` para textos longos.

## publish:evento

Preview com watermark → \`public/images/uploads/eventos/\` → alta no R2 privado → sync-catalog.

Após eventos: redeploy \`frreinert-api\`.

## sync-catalog

Lê \`src/content/eventos/*.md\` → \`workers/frreinert-api/src/catalog.json\`.

## notify:posts

OneSignal no CI — ver \`docs/PUSH.md\`.

## Helpers

- \`scripts/lib/r2-put.mjs\`, \`optimize-images.mjs\`, \`assert-mp3.mjs\`
- Cache intermediário: \`.publish-cache/\` (gitignored)
`,
};

async function main() {
  for (const [rel, content] of Object.entries(files)) {
    const filePath = path.join(root, rel);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
    console.log(`  ✓ ${rel}`);
  }
  console.log('\nArquivos locais de agente criados (gitignored).');
  console.log('Reexecute: npm run setup:agents');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
