# Fabricio Reinert — fotolog (Astro + GitHub Pages + Cloudflare)

Site estático em Astro (`base: /frreinert`). Conteúdo via CLI; comércio via Worker `frreinert-api` + Mercado Pago.

## Desenvolvimento

```sh
npm install
cp .env.example .env   # PUBLIC_MEDIA_BASE = CDN R2
npm run dev            # http://localhost:4321/frreinert/
```

Se o content layer ficar desatualizado: `npm run dev:fresh`.

## Publicações

Fluxo oficial — **um comando** + push do markdown:

```sh
npm run publish:post -- \
  --dir ./minhas-fotos \
  --slug sao-joao-timbo-2026 \
  --title "São João de Timbó 2026" \
  --description "Uma festa tradicional..."
```

Isso otimiza imagens, sobe mídia ao bucket **`frreinert-media`** e escreve `src/content/publicacoes/<slug>.md` (sem binários no Git). Depois: commit/push do `.md` (ou `--push`).

Mídia pública é servida pelo CDN R2 (`PUBLIC_MEDIA_BASE`), sem Worker:

```text
https://pub-08de7bb0447846519a48ee1f1e9bf92a.r2.dev
```

SVGs de pagamento em `public/images/payment/` continuam versionados.

**Guia completo:** [docs/PUBLICACOES.md](docs/PUBLICACOES.md)

## Eventos (fotos à venda)

```sh
npm run publish:evento -- --dir ./inbox/evento --title "..." --price 6
# sync-catalog já roda no ingest; depois:
cd workers/frreinert-api && npx wrangler deploy
```

Detalhes: [docs/COMMERCE.md](docs/COMMERCE.md)

## Scripts úteis

| Comando | Ação |
| --- | --- |
| `npm run dev` | Dev server Astro |
| `npm run build` | Build estático |
| `npm run publish:post` | Publicar post (imagens + áudio → R2 + `.md`) |
| `npm run publish:evento` | Ingerir evento (preview + R2 privado + catálogo) |
| `npm run sync-catalog` | Sync catálogo de eventos → API Worker |
| `npm run optimize-images` | Otimiza pasta de fotos (utilitário) |
