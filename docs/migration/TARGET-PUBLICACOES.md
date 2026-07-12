# Contrato do CLI `publish:post` + guia operacional alvo

Este arquivo é a **especificação de produto** do fluxo pós-migração. O passo 03 implementa o CLI; o passo 06 promove o conteúdo para [`docs/PUBLICACOES.md`](../PUBLICACOES.md).

**Script npm canônico:** `publish:post` (evita conflito com `npm publish`). Alias opcional `pub` se desejado.

---

## Visão rápida (alvo)

```text
npm run publish:post -- … → git push do .md → conferir site
```

| O que fica no Git | O que vai para o R2 |
| --- | --- |
| Markdown em `src/content/publicacoes/` | Fotos em `images/uploads/...` (ou `images/publicacoes/<slug>/...`) |
| Paths no frontmatter (`cover`, `gallery`, `audio_file`) | Áudio em `audio/...` |

Em produção, URLs de mídia usam `PUBLIC_MEDIA_BASE` (CDN R2 **sem** Worker), não `*.workers.dev` de mídia.

---

## Contrato do CLI — `npm run publish:post`

### Comando canônico

```sh
npm run publish:post -- \
  --dir ./minhas-fotos \
  --slug sao-joao-timbo-2026 \
  --title "São João de Timbó 2026" \
  --description "Uma festa tradicional..." \
  --date 2026-06-26 \
  --audio ./faixa.mp3 \
  --carousel \
  --max-edge 2048 \
  --quality 85
```

### Flags obrigatórias / opcionais

| Flag | Obrigatório | Default | Descrição |
| --- | --- | --- | --- |
| `--dir <path>` | sim | — | Pasta com fotos originais |
| `--slug <slug>` | sim | — | Só `a-z`, `0-9`, hífen; vira `path_slug` e nome do `.md` |
| `--title <text>` | sim* | — | Título (*ou `--update` em publicação existente) |
| `--description <text>` | sim* | — | Descrição curta |
| `--date <ISO ou YYYY-MM-DD>` | não | agora | Data da publicação |
| `--audio <path>` | não | — | MP3 real (não DASH disfarçado); nome ASCII no destino |
| `--spotify <url>` | não | — | Preview Spotify (áudio próprio tem prioridade no site) |
| `--carousel` | não | false | `carousel: true` no frontmatter |
| `--cover <filename>` | não | primeira imagem | Nome do arquivo (pós-otimização) usado como capa |
| `--body <path>` | não | vazio / stdin opcional | Markdown do corpo |
| `--max-edge <n>` | não | 2048 | Maior lado JPEG (mesma regra de `optimize-images`) |
| `--quality <n>` | não | 85 | Qualidade JPEG 40–95 |
| `--out <path>` | não | temp sob `.publish-cache/` ou `<dir>/optimized` | Pasta intermediária de JPEGs |
| `--dry-run` | não | false | Lista ações sem escrever R2 nem `.md` |
| `--skip-upload` | não | false | Só otimiza + gera `.md` com paths (dev) |
| `--update` | não | false | Atualiza `.md` existente; permite omitir title/description se já houver |
| `--push` | não | false | Opcional: `git add` do `.md` + commit + push (só se o agente/implementação decidir suporte; senão documentar comando manual) |

### Comportamento obrigatório

1. **Otimizar** imagens com a mesma lógica de [`scripts/optimize-blog-images.mjs`](../../scripts/optimize-blog-images.mjs) (JPEG web, sem marca d’água).
2. **Renomear** para ASCII (sem acentos/espaços) se necessário; avisar no log.
3. **Validar áudio**: extensão `.mp3` e conteúdo MPEG layer III (recusar YouTube-DASH disfarçado); destino `audio/<nome-ascii>.mp3`.
4. **Upload R2** bucket `frreinert-media` via `wrangler r2 object put --remote` (reusar/adaptar [`scripts/sync-media.mjs`](../../scripts/sync-media.mjs)), com `Content-Type` correto.
5. **Keys R2** compatíveis com paths do frontmatter, ex.:
   - `images/uploads/<file>.jpg` **ou** `images/publicacoes/<slug>/<file>.jpg` (escolher um esquema e documentar; preferência: manter `images/uploads/` para não quebrar publicações existentes).
   - `audio/<file>.mp3`
6. **Gerar/atualizar** `src/content/publicacoes/<slug>.md` com frontmatter válido em [`src/content.config.ts`](../../src/content.config.ts):

```yaml
---
title: "..."
path_slug: meu-slug
date: 2026-06-26T19:00:00.000-03:00
description: "..."
cover: /images/uploads/capa.jpg
carousel: true
gallery:
  - /images/uploads/foto-01.jpg
audio_file: /audio/faixa.mp3
# spotify_url: ""   # opcional
---

Corpo em markdown…
```

7. **Não** adicionar JPG/MP3 ao índice Git. Mídia só no R2. Não exigir `sync-media:prune`.
8. Ao terminar, imprimir:
   - path do `.md`
   - URLs de smoke-test (`$PUBLIC_MEDIA_BASE/images/...`, áudio)
   - próximos passos: `git add` do `.md`, commit, push

### Scripts legados

| Script | Destino |
| --- | --- |
| `optimize-images` | Pode permanecer como utilitário fino; `publish` o chama ou compartilha módulo |
| `sync-media` / `sync-media:prune` | Deprecar após 03; upload fica dentro de `publish:post` |
| `cms` | Remover no passo 05 |

### Eventos (fora do `publish` de publicações)

Continua:

```sh
npm run ingest-photos -- --dir ./inbox/evento --title "..." --price 6
npm run sync-catalog
# redeploy frreinert-api quando catalog mudar
```

Opcional no passo 04: alias `npm run publish:evento` → `ingest-photos`.

---

## Checklist operacional (alvo em PUBLICACOES.md)

### Pré-requisitos (uma vez)

```sh
npm install
npx wrangler login   # conta com bucket frreinert-media
cp .env.example .env # PUBLIC_MEDIA_BASE = CDN R2 (sem Worker)
```

### Por publicação

- [ ] Fotos na pasta local; nomes preferencialmente ASCII
- [ ] Áudio MP3 real (se houver), nome ASCII
- [ ] `npm run publish:post -- --dir … --slug … --title … --description …` (+ flags)
- [ ] Revisar o `.md` gerado (corpo, capa, ordem da galeria)
- [ ] `git add src/content/publicacoes/<slug>.md && git commit && git push`
- [ ] Deploy Pages OK
- [ ] Conferir página, imagens e trilha no ar

### Conferir no ar

1. `https://frreinert.github.io/frreinert/publicacoes/<slug>/`
2. Capa/galeria via `PUBLIC_MEDIA_BASE`
3. Player de trilha (se `audio_file`)
4. Hard refresh se cache

```sh
curl -sI "$PUBLIC_MEDIA_BASE/audio/seu-arquivo.mp3"
```

### O que não fazer

- Não usar Decap / `/admin/`
- Não commitar pastas de JPG/MP3 “para o site funcionar”
- Não confundir com eventos (`ingest-photos` + R2 privado)
- Não apontar `PUBLIC_MEDIA_BASE` para o Worker antigo após cutover

### Problemas comuns (alvo)

| Sintoma | Causa | Ação |
| --- | --- | --- |
| 404 mídia | Upload não rodou / key errada | Re-rodar `publish:post` ou upload; checar key no R2 |
| Áudio não toca | DASH disfarçado de MP3 | `ffmpeg` → MP3 real e republicar áudio |
| Local sem imagens | Sem `.env` | `cp .env.example .env` |
| Repo inchando | Binários commitados | Remover do Git; só `.md` versionado |
