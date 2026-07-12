# Playbook de migração — estático simples + comércio intacto

Branch de trabalho: **`feat/jekyl-migration`** (paralelo a `main` / blog em produção).

## Objetivo

Simplificar publicação e reduzir superfície de Workers **sem** mudar a experiência do usuário e **sem** reescrever o comércio.

| Camada | Hoje | Alvo |
| --- | --- | --- |
| SSG / UX | Astro 7 estático | Astro 7 (mesma UX) |
| CMS | Removido (passo 05) | — |
| Publicação | CLI `publish:post` + push do `.md` | Igual (docs em [`docs/PUBLICACOES.md`](../PUBLICACOES.md)) |
| Mídia pública | R2 + CDN `PUBLIC_MEDIA_BASE` (código Worker removido no 07) | Desligar Worker legado no CF + merge |
| Comércio | Worker `frreinert-api` | **Intacto** |
| Eventos | `publish:evento` (= `ingest-photos`) + `sync-catalog` | Mantido |

**Não migrar para Jekyll.** O site já é estático; o custo de reescrever carrossel, áudio, carrinho e checkout em Liquid não reduz a necessidade do Worker de comércio.

## Arquitetura alvo

```text
npm run publish:post
  → otimiza imagens / valida áudio
  → upload R2 (frreinert-media) via wrangler
  → escreve src/content/publicacoes/<slug>.md
  → (humano) git push só do markdown

GitHub Actions → Astro build (PUBLIC_MEDIA_BASE = CDN R2)
  → GitHub Pages (HTML)

Browser
  → HTML/CSS/JS em Pages
  → images/audio no CDN R2 (sem Worker)
  → checkout / OTP / download → frreinert-api (inalterado)
```

## Restrições globais (todo agente)

1. Trabalhar no branch `feat/jekyl-migration`.
2. **Não alterar** comportamento de `workers/frreinert-api/` salvo o passo opcional 08.
3. **Não alterar** o bucket privado `frreinert-photos` nem o fluxo Mercado Pago / OTP / magic link, salvo 08.
4. Manter paridade UX do [00-ux-inventory.md](./00-ux-inventory.md).
5. Não editar o arquivo de plano Cursor; só este playbook e o código do repo.
6. Não fazer merge em `main` nem cutover de produção antes do passo 07.

## Ordem dos agentes

| # | Arquivo | Resumo |
| --- | --- | --- |
| 00 | [00-ux-inventory.md](./00-ux-inventory.md) | Inventário UX + mapa remove/mantém |
| 01 | [01-cdn-without-worker.md](./01-cdn-without-worker.md) | CDN R2 sem Worker de mídia |
| 02 | [02-wire-media-urls.md](./02-wire-media-urls.md) | `PUBLIC_MEDIA_BASE` no build |
| 03 | [03-publish-cli.md](./03-publish-cli.md) | CLI único `publish:post` |
| 04 | [04-eventos-cli.md](./04-eventos-cli.md) | Alinhar eventos / aliases CLI |
| 05 | [05-remove-decap.md](./05-remove-decap.md) | Remover Decap + OAuth Worker |
| 06 | [06-docs-rewrite.md](./06-docs-rewrite.md) | Docs operacionais novos |
| 07 | [07-cutover.md](./07-cutover.md) | Cutover produção + decommission |
| 08 | [08-api-hardening.md](./08-api-hardening.md) | Opcional: rate limit / Turnstile na API |

Contrato do CLI (`publish:post`): [TARGET-PUBLICACOES.md](./TARGET-PUBLICACOES.md). Guia operacional promovido: [`docs/PUBLICACOES.md`](../PUBLICACOES.md) (passo 06).

CDN atual (dev / Pages): `https://pub-08de7bb0447846519a48ee1f1e9bf92a.r2.dev` (`.env.example`, `deploy.yml`).

## Critérios globais de sucesso

- [ ] UX de publicações / eventos / carrinho igual à atual (checklist do 00).
- [ ] Publicar publicação = **um comando (`publish:post`) + push do markdown** (sem Decap, sem prune manual).
- [ ] Zero Workers para mídia pública e CMS.
- [ ] `frreinert-api` e `frreinert-photos` com o mesmo comportamento.
- [ ] `main` intacto até cutover explícito no 07.

## Como acionar um agente

Cole o bloco **Prompt para o agente** do arquivo `NN-*.md` correspondente, no chat Cursor, com o repo aberto no branch `feat/jekyl-migration`. Execute **um passo por vez**, na ordem. Só avance se o Definition of Done do passo estiver marcado.
