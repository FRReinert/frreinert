# Passo 01 — Notas do CDN R2 (sem Worker)

Data: 2026-07-11 (branch `feat/jekyl-migration`).

## Host final (atual)

| Papel | URL |
| --- | --- |
| **PUBLIC_MEDIA_BASE (produção)** | `https://cdn.frreinert.com.br` |
| Fallback / rollback (`r2.dev`) | `https://pub-08de7bb0447846519a48ee1f1e9bf92a.r2.dev` |
| Worker legado (desligar no CF se ainda no ar) | `https://frreinert-media.fabricio-reinert.workers.dev` |
| Custom domain | **ativo** — `cdn.frreinert.com.br` → bucket `frreinert-media` |

Exemplo de objeto:

```text
https://cdn.frreinert.com.br/images/uploads/dscf2447.jpg
https://cdn.frreinert.com.br/audio/vava-ribeiro-calmaria-v2.mp3
```

Keys R2 inalteradas: `images/...`, `audio/...` (mesmos paths do frontmatter / Decap).

### TODO produção / DNS

- [x] `deploy.yml` / `.env.example` com `PUBLIC_MEDIA_BASE` = CDN custom domain.
- [x] Custom domain `cdn.frreinert.com.br` conectado ao bucket `frreinert-media` (Active).
- [x] Cache Rule (Eligible for cache + Edge/Browser TTL 1 month) + Smart Tiered Cache.
- [x] Manter `r2.dev` **Enabled** só como fallback operacional (reverter env + redeploy).

## Passos executados (Wrangler / API)

Conta: `0ca63094e18e35ec3c514d7e0dfaa908` (OAuth wrangler, usuário já logado).

1. `npx wrangler r2 bucket list` — confirmou `frreinert-media` e `frreinert-photos` (este último **não tocado**).
2. `npx wrangler r2 bucket domain list frreinert-media` — nenhum custom domain.
3. `npx wrangler r2 bucket dev-url enable frreinert-media --force` — public access em  
   `https://pub-08de7bb0447846519a48ee1f1e9bf92a.r2.dev`.
4. CORS aplicado a partir de [`workers/frreinert-media/cors.json`](../../workers/frreinert-media/cors.json):

   ```sh
   npx wrangler r2 bucket cors set frreinert-media --file cors.json --force
   ```

   Origins: `https://frreinert.github.io`, `http://localhost:4321`, `http://127.0.0.1:4321`.  
   Methods: `GET`, `HEAD`. Headers: `Range`, etc. Expose: `Content-Length`, `Content-Range`, `Accept-Ranges`, …

5. Worker `frreinert-media` **não deletado** (decommission no passo 07); marcado deprecated no `wrangler.toml` / README.

## Verificação `curl`

### Imagem existente → 200 + content-type

```sh
curl -sI "https://pub-08de7bb0447846519a48ee1f1e9bf92a.r2.dev/images/uploads/dscf2447.jpg"
```

Resultado observado:

```text
HTTP/1.1 200 OK
Content-Type: image/jpeg
Content-Length: 59784
Accept-Ranges: bytes
ETag: "450f484748eb0954b262537b4ad80258"
```

### MP3 com Range → 206

```sh
curl -sI -H "Range: bytes=0-1023" \
  "https://pub-08de7bb0447846519a48ee1f1e9bf92a.r2.dev/audio/vava-ribeiro-calmaria-v2.mp3"
```

Resultado observado:

```text
HTTP/1.1 206 Partial Content
Content-Type: audio/mpeg
Content-Length: 1024
Content-Range: bytes 0-1023/5073180
Accept-Ranges: bytes
```

**Conclusão:** Range nativo do R2 público é suficiente para o player sticky; **não** é necessário proxy mínimo.

### CORS (Origin do site)

```sh
curl -sI -H "Origin: https://frreinert.github.io" \
  -H "Range: bytes=0-1023" \
  "https://pub-08de7bb0447846519a48ee1f1e9bf92a.r2.dev/audio/vava-ribeiro-calmaria-v2.mp3"
```

Inclui `Access-Control-Allow-Origin: https://frreinert.github.io` e  
`Access-Control-Expose-Headers: …Content-Range…` (necessário para `<audio crossorigin>`).

## Diferenças vs Worker `frreinert-media`

| Aspecto | Worker (legado) | R2 public (`r2.dev`) |
| --- | --- | --- |
| Auth | Nenhuma (allowlist path) | Nenhuma (bucket inteiro público via host) |
| Allowlist `images/` / `audio/` | Sim, 404 fora do prefixo | **Não** — qualquer key pública no bucket é GET-ável |
| Range | Sim (206) | Sim (206) — OK para MP3 |
| CORS | Echo `Origin` + `*` fallback no código | Política explícita no bucket (`cors.json`) |
| `Cache-Control` | `public, max-age=31536000, immutable` forçado | **Não** enviado por padrão no `r2.dev` (só ETag / Last-Modified) |
| Content-Type | Override por extensão no Worker | Vem do metadata do objeto no put (JPEG/MP3 já corretos nos testes) |
| Produção | workers.dev | Preferir custom domain + Cache Everything (passo futuro / 07) |

Risco allowlist: o bucket hoje só tem mídia pública (`images/`, `audio/`). Não colocar secrets neste bucket. `frreinert-photos` permanece privado e ligado só ao `frreinert-api`.

## Uso local (dev)

Em `.env` (não commitado), alinhar com `.env.example`:

```sh
PUBLIC_MEDIA_BASE=https://cdn.frreinert.com.br
```

Sem esse valor, `assetUrl` cai no `base` do Astro (`/frreinert/...` em `/public`).

## Deploy.yml

Produção usa o custom domain:

```yaml
PUBLIC_MEDIA_BASE: https://cdn.frreinert.com.br
```

Rollback: apontar de volta para `https://pub-08de7bb0447846519a48ee1f1e9bf92a.r2.dev` e redeploy.
