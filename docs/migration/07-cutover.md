# Passo 07 — Cutover e decommission

## Prompt para o agente

```text
Você está no repo vng-fotolog, branch feat/jekyl-migration.

Pré-requisitos: passos 00–06 concluídos.

Leia: docs/migration/07-cutover.md, docs/migration/01-cdn-notes.md,
docs/PUBLICACOES.md (novo), .github/workflows/deploy.yml.

Tarefa: executar o checklist de cutover (abaixo) e registrar resultados em
docs/migration/07-cutover-log.md.

Inclui:
1. Confirmar PUBLIC_MEDIA_BASE de produção = CDN (não Worker).
2. Smoke test publicações (HTML + imagens + áudio Range/play).
3. Smoke test comércio mínimo (abrir checkout / pedido — sem precisar pagar de verdade
   se não houver sandbox; ao menos API health / OTP rate-limit responde).
4. Remover código morto workers/frreinert-media se ainda existir.
5. Confirmar workers/frreinert-decap-oauth já removido (05).
6. Instruções para desligar os Workers na Cloudflare e revogar GitHub OAuth App do CMS.
7. NÃO mergear em main sem confirmação explícita do usuário humano.
8. NÃO alterar comportamento de frreinert-api.

Produza 07-cutover-log.md com checkboxes marcados e URLs testadas.
```

## Objetivo

Produção serve mídia sem Worker; CMS morto; comércio OK; branch pronto para merge quando o humano autorizar.

## Checklist de cutover

### Infra

- [x] DNS / custom domain R2 ativo e estável (`cdn.frreinert.com.br`)
- [x] `deploy.yml` / `.env.example` com `PUBLIC_MEDIA_BASE` = `https://cdn.frreinert.com.br`
- [x] Objetos antigos (`images/uploads/...`, `audio/...`) OK no CDN; `r2.dev` como rollback

### Smoke estático

- [x] Home e listagem publicações
- [x] Detalhe com carrossel/galeria
- [x] Áudio toca (player + `curl -sI` no MP3)
- [x] Eventos listagem/detalhe (previews)
- [x] Carrinho UI (localStorage) sem erro de console crítico

### Smoke dinâmico (API intacta)

- [x] Worker `frreinert-api` responde
- [x] Fluxo OTP ou magic link não regrediu (teste controlado)
- [x] Download ainda exige sessão/token (não aberto)

### Decommission

- [x] Código `workers/frreinert-media` removido do branch
- [ ] Worker `frreinert-media` desligado/deletado no dashboard CF (humano ou wrangler)
- [ ] Worker `frreinert-decap-oauth` desligado/deletado
- [ ] GitHub OAuth App do Decap revogado/deletado
- [x] Sem referências a `frreinert-media.fabricio-reinert.workers.dev` no código/docs ativos

### Merge (autorizado pelo humano 2026-07-12)

- [x] Merge `feat/jekyl-migration` → `main` (`1a0823f`)
- [x] Actions Pages verde ([run 29178023813](https://github.com/FRReinert/frreinert/actions/runs/29178023813))
- [x] Verificação pós-merge em produção (CDN; `/admin/` 404) — ver [07-cutover-log.md](./07-cutover-log.md)

## Restrições

- Não force-push em `main`.
- Não alterar secrets do `frreinert-api` sem necessidade.
- Cutover de DNS/Workers na Cloudflare pode exigir ação manual do dono da conta — documentar o que o agente não conseguiu fazer.

## Definition of Done

- [x] `07-cutover-log.md` preenchido
- [x] Produção (ou preview do branch) sem Worker de mídia
- [x] Admin Decap inacessível
- [x] Comércio validado no nível acordado no checklist
- [x] Branch mergeável; merge só após confirmação do usuário

Log detalhado: [07-cutover-log.md](./07-cutover-log.md).
