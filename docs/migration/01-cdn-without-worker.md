# Passo 01 — CDN de mídia pública sem Worker

## Prompt para o agente

```text
Você está no repo vng-fotolog, branch feat/jekyl-migration.

Leia: docs/migration/README.md e docs/migration/01-cdn-without-worker.md.
Pré-requisito: passo 00 (inventário) concluído ou em paralelo só leitura.

Tarefa: configurar o bucket R2 `frreinert-media` para ser servido publicamente
SEM o Worker `frreinert-media` (custom domain Cloudflare ou r2.dev público estável).

Documente o host final escolhido em docs/migration/01-cdn-notes.md (criar)
e atualize .env.example com um placeholder do novo PUBLIC_MEDIA_BASE se o host
já estiver definido. NÃO mude ainda o deploy.yml de produção se o DNS não
estiver pronto — nesse caso deixe o valor documentado e um TODO claro.

Restrições:
- Não autenticar mídia pública
- Não mexer no bucket privado frreinert-photos
- Não alterar workers/frreinert-api
- Não deletar o código do Worker ainda (decommission no passo 07); pode marcar
  como deprecated em comentário/README do worker
- Manter keys existentes (images/..., audio/...) acessíveis
```

## Objetivo

Servir `images/` e `audio/` do R2 via CDN/domínio público, eliminando a necessidade do Worker só-para-GET.

## Contexto

Hoje [`workers/frreinert-media/src/index.ts`](../../workers/frreinert-media/src/index.ts):

- Allowlist `images/`, `audio/`
- `Cache-Control: public, max-age=31536000, immutable`
- CORS + **Range** (importante para MP3)
- URL: `https://frreinert-media.fabricio-reinert.workers.dev`

Alvo: mesmo bucket, host sem Worker (ex. `media.frreinert...` via R2 custom domain).

## Trabalho esperado

1. No dashboard Cloudflare (ou via docs wrangler): expor bucket `frreinert-media` publicamente.
2. Preferir **custom domain**; se não houver DNS pronto, usar URL pública R2 documentada e estável.
3. Verificar:
   - `GET` imagem existente → 200 + content-type
   - `GET` MP3 com `Range` → 206 se a plataforma suportar (nota: R2 public access pode diferir do Worker; se Range falhar, documentar e avaliar proxy mínimo — **só** se necessário; preferir CDN nativo)
4. Escrever `docs/migration/01-cdn-notes.md` com:
   - host final
   - passos de console executados
   - exemplos `curl -sI`
   - diferenças vs Worker (CORS, Range, cache)

## Arquivos relevantes

- `workers/frreinert-media/` (referência de comportamento; não apagar ainda)
- `.env.example`
- `docs/PUBLICACOES.md` (ainda antigo; não reescrever por completo aqui)

## Restrições

- Sem auth na mídia pública.
- Sem mudanças no comércio / `frreinert-photos`.

## Definition of Done

- [ ] Host CDN documentado em `01-cdn-notes.md`
- [ ] Objeto de teste (imagem + áudio existentes) acessível no host novo
- [ ] `.env.example` atualizado **ou** TODO explícito se DNS pendente
- [ ] Worker de mídia ainda no repo (remoção só no 07)
- [ ] `frreinert-api` intocado
