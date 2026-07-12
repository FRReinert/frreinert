# Passo 02 — Wire de URLs no build (`PUBLIC_MEDIA_BASE`)

## Prompt para o agente

```text
Você está no repo vng-fotolog, branch feat/jekyl-migration.

Leia: docs/migration/README.md, docs/migration/02-wire-media-urls.md
e docs/migration/01-cdn-notes.md (host do passo 01).

Tarefa: apontar o site para o novo CDN.
1. Atualizar .env.example com PUBLIC_MEDIA_BASE = host do passo 01 (sem barra final).
2. Atualizar .github/workflows/deploy.yml (env PUBLIC_MEDIA_BASE no build).
3. Confirmar que src/lib/paths.ts assetUrl() continua correto (só paths images/ e audio/).
4. Rodar npm run build com a env nova e verificar no dist que URLs de mídia
   apontam para o CDN novo (não para *.workers.dev de mídia).

Não remova o Worker ainda. Não altere frreinert-api. Não remova Decap ainda.
```

## Objetivo

Todo HTML gerado resolve capa/galeria/áudio via CDN novo.

## Contexto

[`src/lib/paths.ts`](../../src/lib/paths.ts) já reescreve paths que começam com `images/` ou `audio/` quando `PUBLIC_MEDIA_BASE` está setado. Frontmatter atual usa paths tipo `/images/uploads/...` e `/audio/...`.

## Arquivos a alterar

- [`.env.example`](../../.env.example)
- [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)
- Possivelmente comentários em `README.md` (mínimo; docs completas no 06)
- **Não** precisa mudar `assetUrl` se o contrato de path for o mesmo

## Verificação

```sh
# com PUBLIC_MEDIA_BASE do CDN novo
npm run build
# grep no dist por workers.dev de mídia (deve ser zero)
# grep por host CDN novo (deve aparecer nas páginas de publicação)
```

Smoke local:

```sh
cp .env.example .env   # se ainda não
npm run dev
# abrir publicação existente; network tab → imagens no CDN novo
```

## Restrições

- Não quebrar paths de SVGs de pagamento em `public/images/payment/` (devem continuar no site base, não no CDN de uploads — `assetUrl` só prefixa `images/` e `audio/`; payment também é `images/` — **cuidado**: hoje payment SVGs versionados em Git sob `public/images/payment/`. Se `PUBLIC_MEDIA_BASE` estiver setado, `assetUrl('/images/payment/pix.svg')` iria ao CDN.

**Ação obrigatória neste passo:** verificar usos de `assetUrl` / payment icons. Se payment passar pelo mesmo helper, ou:

- excluir `images/payment/` do rewrite em `paths.ts`, **ou**
- garantir que esses SVGs também existem no R2, **ou**
- não passar payment por `assetUrl` (usar `withBase`).

Preferência: **excluir `images/payment/` do rewrite** para CDN, mantendo ícones no Pages.

## Definition of Done

- [x] `.env.example` e `deploy.yml` com host CDN novo
- [x] `assetUrl` não quebra ícones de pagamento
- [x] `npm run build` OK; dist sem URL do Worker de mídia
- [x] Publicação existente resolve mídia no CDN novo em preview local
- [x] `frreinert-api` intocado

Verificação 2026-07-11: build com `PUBLIC_MEDIA_BASE=https://pub-08de7bb0447846519a48ee1f1e9bf92a.r2.dev`;
dist sem `frreinert-media*.workers.dev`; publicação usa host `r2.dev`; payment via `/frreinert/images/payment/`.
`images/payment/` excluído do rewrite em `src/lib/paths.ts`. Carrinho passou a importar o mesmo `assetUrl`.
