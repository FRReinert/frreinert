# Passo 05 — Remover Decap e Worker OAuth

## Prompt para o agente

```text
Você está no repo vng-fotolog, branch feat/jekyl-migration.

Pré-requisitos: passos 03 (CLI publish:post) e 04 (eventos via CLI) feitos.

Leia: docs/migration/05-remove-decap.md, public/admin/, 
workers/frreinert-decap-oauth/, docs/COMMERCE.md (seção Decap), README.md.

Tarefa:
1. Remover public/admin/ (Decap UI + config.yml).
2. Remover script npm "cms" e dependência de uso de decap-server.
3. Remover ou esvaziar workers/frreinert-decap-oauth/ (código + nota de decommission;
   desligar o Worker na Cloudflare pode ficar para o passo 07, mas o código
   não deve mais ser necessário no repo).
4. Remover links /admin/ de qualquer página/layout/README.
5. Atualizar docs/COMMERCE.md: remover instruções de GitHub OAuth App para CMS;
   apontar eventos para publish:evento / ingest-photos.
6. Não alterar workers/frreinert-api.
7. Não quebrar build Astro (npm run build).

Ao final: grep -r admin|decap|decap-oauth no repo (exceto docs/migration histórico)
deve estar limpo ou só mencionar remoção.
```

## Objetivo

Eliminar CMS web e o Worker OAuth associado (superfície de auth desnecessária para conteúdo estático).

## Contexto

- Admin prod: `https://frreinert.github.io/frreinert/admin/`
- OAuth: `workers/frreinert-decap-oauth` + GitHub OAuth App
- Local: `npm run cms` + `decap-server`

Publicação e eventos passam a ser só CLI (passos 03–04).

## Arquivos a remover/alterar

- `public/admin/` (remover)
- `workers/frreinert-decap-oauth/` (remover)
- `package.json` — script `cms`
- `README.md`, `docs/COMMERCE.md` — referências Decap/OAuth CMS
- Qualquer link no site para `/admin/`

## Restrições

- Não remover `frreinert-media` Worker code ainda se o 07 não rodou (pode coexistir deprecated).
- Não alterar API de comércio.
- Manter `public/images/payment/` e assets estáticos necessários.

## Definition of Done

- [x] `/admin/` não existe no build (`dist` sem admin)
- [x] Sem script `cms`
- [x] Sem pasta `workers/frreinert-decap-oauth`
- [x] COMMERCE/README sem fluxo OAuth de CMS
- [x] `npm run build` OK
- [x] `frreinert-api` intocado
