# Como publicar uma nova Publicação

Guia operacional pós-migração. Um comando sobe a mídia ao R2 e gera o Markdown; o Git só versiona o `.md`.

## Visão rápida

```text
npm run publish:post -- … → git push do .md → conferir site
```

| O que fica no Git | O que vai para o R2 (`frreinert-media`) |
| --- | --- |
| Markdown em `src/content/publicacoes/` | Fotos em `images/uploads/...` |
| Paths no frontmatter (`cover`, `gallery`, `audio_file`) | Áudio em `audio/...` |

Em produção (e no `npm run dev` com `.env`), as URLs usam `PUBLIC_MEDIA_BASE` — CDN R2 **sem** Worker:

```text
https://cdn.frreinert.com.br
```

(mesmo valor em `.env.example` e no workflow de deploy)

**Feed RSS (leitores / Chrome Follow):** `https://frreinert.com.br/rss.xml`  
Metadados em `src/lib/content/feed.ts`. Cada `publish:post` + deploy regenera o feed automaticamente.

**Web Push (notificação no navegador):** OneSignal + Action no deploy — ver [PUSH.md](./PUSH.md). Um `.md` **novo** em `publicacoes/` dispara o aviso aos inscritos.

Rollback: `https://pub-08de7bb0447846519a48ee1f1e9bf92a.r2.dev` (reverter env + redeploy).

**Eventos (fotos à venda) são outro fluxo:** `npm run publish:evento` — ver [COMMERCE.md](./COMMERCE.md).

---

## Pré-requisitos (uma vez)

```sh
npm install
npx wrangler login   # conta Cloudflare com o bucket frreinert-media
cp .env.example .env # PUBLIC_MEDIA_BASE = CDN R2 acima
```

---

## Comando canônico

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

O script:

1. Otimiza imagens (JPEG web, sem marca d’água)
2. Valida MP3 real (recusa DASH/YouTube disfarçado) e renomeia para ASCII se preciso
3. Faz upload para o R2 `frreinert-media` (`images/uploads/…`, `audio/…`)
4. Escreve `src/content/publicacoes/<slug>.md`
5. Imprime path do `.md` e URLs de smoke-test

**Não** adiciona JPG/MP3 ao Git.

### Flags

| Flag | Obrigatório | Default | Descrição |
| --- | --- | --- | --- |
| `--dir <path>` | sim | — | Pasta com fotos originais |
| `--slug <slug>` | sim | — | Só `a-z`, `0-9`, hífen; vira nome do `.md` |
| `--title <text>` | sim* | — | Título (*omitível com `--update` se o `.md` já existe) |
| `--description <text>` | sim* | — | Descrição curta |
| `--date <ISO ou YYYY-MM-DD>` | não | agora (−03:00) | Data da publicação |
| `--audio <path>` | não | — | MP3 real → `audio/<nome-ascii>.mp3` |
| `--spotify <url>` | não | — | Preview Spotify (áudio próprio tem prioridade no site) |
| `--carousel` | não | false | `carousel: true` no frontmatter |
| `--cover <filename>` | não | 1ª imagem | Nome do arquivo pós-otimização usado como capa |
| `--body <path>` | não | vazio | Markdown do corpo |
| `--max-edge <n>` | não | 2048 | Maior lado JPEG |
| `--quality <n>` | não | 85 | Qualidade JPEG 40–95 |
| `--out <path>` | não | `.publish-cache/<slug>` | Pasta intermediária de JPEGs |
| `--dry-run` | não | false | Lista ações sem R2 nem `.md` |
| `--skip-upload` | não | false | Otimiza + gera `.md` sem R2 (dev) |
| `--update` | não | false | Atualiza `.md` existente |
| `--push` | não | false | `git add` + commit + push só do `.md` |
| `--help` | não | — | Ajuda |

Áudio: preferir nomes ASCII (`vava-ribeiro-calmaria.mp3`). Se o arquivo for suspeito:

```sh
ffmpeg -i entrada.qualquer -vn -codec:a libmp3lame -qscale:a 2 ./faixa.mp3
```

### Frontmatter gerado (exemplo)

```yaml
---
title: "..."
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

---

## Depois do CLI

Sem `--push`:

```sh
git add src/content/publicacoes/SEU-SLUG.md
git commit -m "Add publicação SEU-SLUG"
git push
```

Com `--push`, o script faz isso pelo `.md` gerado.

O GitHub Actions faz o build/deploy do Pages (`PUBLIC_MEDIA_BASE` já no workflow).

---

## Conferir no ar

1. `https://frreinert.com.br/publicacoes/<slug>/`
2. Capa/galeria via `PUBLIC_MEDIA_BASE`
3. Player de trilha (se `audio_file`)
4. Hard refresh se cache antigo

```sh
# Preferir GET ao validar cache (HEAD em R2 custom domain pode mostrar DYNAMIC)
curl -sD - -o /dev/null "$PUBLIC_MEDIA_BASE/audio/seu-arquivo.mp3"
# ou:
curl -sD - -o /dev/null "https://cdn.frreinert.com.br/audio/seu-arquivo.mp3"
```

---

## Checklist (por publicação)

- [ ] Fotos na pasta local; nomes preferencialmente ASCII
- [ ] Áudio MP3 real (se houver), nome ASCII
- [ ] `npm run publish:post -- --dir … --slug … --title … --description …` (+ flags)
- [ ] Revisar o `.md` gerado (corpo, capa, ordem da galeria)
- [ ] `git add src/content/publicacoes/<slug>.md && git commit && git push` (ou `--push`)
- [ ] Deploy Pages OK
- [ ] Conferir página, imagens e trilha no ar

---

## Problemas comuns

| Sintoma | Causa | Ação |
| --- | --- | --- |
| 404 mídia | Upload não rodou / key errada | Re-rodar `publish:post`; checar key no R2 |
| Áudio não toca | DASH disfarçado de MP3 | `ffmpeg` → MP3 real e republicar |
| Local sem imagens | Sem `.env` | `cp .env.example .env` e `npm run dev` |
| Repo inchando | Binários commitados | Remover do Git; só `.md` versionado |

---

## O que **não** fazer

- Não usar CMS web / `/admin/` (removido)
- Não commitar pastas de JPG/MP3 “para o site funcionar”
- Não confundir com **eventos** (`publish:evento` + R2 privado) — [COMMERCE.md](./COMMERCE.md)
- Não apontar `PUBLIC_MEDIA_BASE` para o Worker antigo `*.workers.dev` de mídia

---

## Comandos úteis

| Comando | Uso |
| --- | --- |
| `npm run publish:post -- --dir ./pasta --slug … --title … --description …` | Publicar |
| `npm run publish:post -- --help` | Flags |
| `npm run optimize-images -- --dir ./pasta` | Só otimizar JPEGs (utilitário fino) |
| `npm run publish:evento -- …` | Eventos à venda — [COMMERCE.md](./COMMERCE.md) |
