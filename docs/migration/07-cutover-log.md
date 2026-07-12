# Cutover log — passo 07

**Branch:** `feat/jekyl-migration`  
**Data:** 2026-07-11 (UTC−3) / 2026-07-12 UTC  
**Agente:** cutover checklist executado; **sem merge em `main`**.

CDN canônico:

```text
https://pub-08de7bb0447846519a48ee1f1e9bf92a.r2.dev
```

---

## Checklist (resultados)

### Infra

- [ ] DNS / custom domain R2 ativo e estável — **não feito.** Conta sem zona para `media.*`; continua `r2.dev` (rate-limited / non-production). Ver [01-cdn-notes.md](./01-cdn-notes.md).
- [x] `deploy.yml` em `feat/jekyl-migration` com `PUBLIC_MEDIA_BASE` = CDN (`pub-08de7bb0…r2.dev`), **não** Worker
- [x] Objetos antigos OK no CDN novo (imagem + áudio Range + CORS)

### Smoke estático

| Item | Resultado | URL / evidência |
| --- | --- | --- |
| Home / listagem publicações | [x] HTML 200 em produção Pages; build do branch gera `dist/` | `https://frreinert.github.io/frreinert/` · `…/publicacoes/` |
| Detalhe + carrossel/galeria | [x] 200; build do branch embute carrossel + URLs CDN | `…/publicacoes/sao-joao-timbo-2026/` |
| Áudio (Range + player) | [x] CDN `206` com Range; `<audio>` no dist aponta CDN | ver curls abaixo |
| Eventos listagem/detalhe | [x] Página `eventos/` 200; **sem** markdown em `src/content/eventos/` neste branch (lista vazia) | `…/eventos/` |
| Carrinho UI | [x] HTML + scripts `data-cart-*` / localStorage presentes no build | `…/carrinho/` · `dist/carrinho/index.html` |

**Nota produção vs branch:** Pages em `main` ainda serve mídia via Worker legado (`frreinert-media.….workers.dev`). O build deste branch já usa só o CDN. Produção muda após merge + Actions.

**Admin em produção Pages:** `/admin/` ainda **200** (código antigo em `main`). No build do branch: **sem** `dist/admin/`.

### Smoke dinâmico (API intacta — `frreinert-api` não alterado)

| Item | Resultado | Evidência |
| --- | --- | --- |
| Worker responde | [x] | `GET https://frreinert-api.fabricio-reinert.workers.dev/` → `{"ok":true,"service":"frreinert-api",…}` secrets/KV/R2 true |
| OTP / magic link | [x] endpoints respondem (sem pagamento sandbox) | `POST /api/auth/email-otp` → 200 mensagem genérica; `POST /api/auth/magic-link` → 200 |
| Download exige auth | [x] | `GET /api/download` → **401** `Não autorizado…` |

Checkout/pedido HTML: `…/checkout/` e `…/pedido/` → 200.

### Decommission

- [x] Código `workers/frreinert-media` **removido** do branch
- [ ] Worker `frreinert-media` desligado/deletado no dashboard CF — **ação humana** (ainda no ar: GET imagem → 200)
- [x] Código `workers/frreinert-decap-oauth` já removido (passo 05)
- [ ] Worker `frreinert-decap-oauth` desligado/deletado no CF — **ação humana**
- [ ] GitHub OAuth App do Decap revogado — **ação humana**
- [x] Sem referências a `frreinert-media.fabricio-reinert.workers.dev` no código/docs **ativos** (fora `docs/migration/` histórico)

CORS do bucket preservado em [`scripts/r2/frreinert-media-cors.json`](../../scripts/r2/frreinert-media-cors.json).  
`scripts/lib/r2-put.mjs` agora usa `cwd: root` (não depende mais da pasta do Worker).

### Merge (só com OK humano)

- [ ] PR `feat/jekyl-migration` → `main`
- [ ] Actions Pages verde pós-merge
- [ ] Verificação pós-merge em produção (HTML com CDN; `/admin/` 404)

---

## Curls registrados

### CDN imagem → 200

```sh
curl -sI "https://pub-08de7bb0447846519a48ee1f1e9bf92a.r2.dev/images/uploads/dscf2447.jpg"
```

```text
HTTP/1.1 200 OK
Content-Type: image/jpeg
Content-Length: 59784
Accept-Ranges: bytes
```

### CDN áudio Range → 206

```sh
curl -sI -H "Range: bytes=0-1023" \
  "https://pub-08de7bb0447846519a48ee1f1e9bf92a.r2.dev/audio/vava-ribeiro-calmaria-v2.mp3"
```

```text
HTTP/1.1 206 Partial Content
Content-Type: audio/mpeg
Content-Length: 1024
Content-Range: bytes 0-1023/5073180
Accept-Ranges: bytes
```

### CDN CORS (Origin Pages)

```sh
curl -sI -H "Origin: https://frreinert.github.io" -H "Range: bytes=0-1023" \
  "https://pub-08de7bb0447846519a48ee1f1e9bf92a.r2.dev/audio/vava-ribeiro-calmaria-v2.mp3"
```

Inclui `Access-Control-Allow-Origin: https://frreinert.github.io` e expose de `Content-Range`.

### API

```sh
curl -sS "https://frreinert-api.fabricio-reinert.workers.dev/"
curl -sS -w "\nHTTP:%{http_code}\n" "https://frreinert-api.fabricio-reinert.workers.dev/api/download"
curl -sS -X POST "https://frreinert-api.fabricio-reinert.workers.dev/api/auth/email-otp" \
  -H "Content-Type: application/json" -d '{"email":"cutover-smoke@example.com"}'
```

### Build do branch (preview local de artefato)

```sh
PUBLIC_MEDIA_BASE=https://pub-08de7bb0447846519a48ee1f1e9bf92a.r2.dev npm run build
# dist/ sem admin; HTML da publicação usa só pub-08de7bb0…r2.dev
```

---

## Ações manuais restantes (humano)

### 1. Desligar Workers na Cloudflare

Só depois do merge em `main` e confirmação de que Pages já usa o CDN (HTML sem `*.workers.dev` de mídia):

```sh
# Conferir que o site em produção aponta ao CDN:
curl -sL "https://frreinert.github.io/frreinert/publicacoes/sao-joao-timbo-2026/" \
  | grep -oE 'https://[^"]+r2\.dev[^"]+|https://frreinert-media[^"]+' | sort -u

# Remover Workers (conta já logada no wrangler):
npx wrangler delete frreinert-media --force
npx wrangler delete frreinert-decap-oauth --force
```

Ou Dashboard → Workers & Pages → cada Worker → Delete / Disable.

**Não** delete `frreinert-api`.

### 2. Revogar GitHub OAuth App do Decap

1. https://github.com/settings/developers → OAuth Apps  
2. App usada no CMS (callback `…/frreinert-decap-oauth…/callback`) → Delete / Revoke  
3. Confirmar que `/admin/` em produção retorna 404 após o deploy do branch

### 3. (Opcional) Custom domain R2

Quando houver zona Cloudflare:

```sh
npx wrangler r2 bucket domain add frreinert-media \
  --domain media.SEU_DOMINIO \
  --zone-id <ZONE_ID> \
  --force
```

Atualizar `PUBLIC_MEDIA_BASE` em `.env.example`, `deploy.yml` e docs; reaplicar CORS se necessário:

```sh
npx wrangler r2 bucket cors set frreinert-media \
  --file scripts/r2/frreinert-media-cors.json --force
```

### 4. Merge

Aguardando confirmação explícita do usuário para abrir/mergear PR `feat/jekyl-migration` → `main`.

---

## Resumo

| Área | Status |
| --- | --- |
| CDN + `deploy.yml` no branch | OK |
| Smoke mídia CDN | OK |
| Smoke API comércio | OK (health / OTP / download 401) |
| Código Worker mídia + OAuth no repo | Removidos |
| Workers ainda no ar (CF) | Pendente humano |
| OAuth App GitHub | Pendente humano |
| Custom domain R2 | Pendente / opcional |
| Merge `main` | **Não feito** (aguardando OK humano) |
