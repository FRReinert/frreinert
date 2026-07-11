# Fabricio Reinert — fotolog (Astro + GitHub Pages + Cloudflare)

Site estático em Astro (`base: /frreinert`), CMS Decap, comércio via Workers + Mercado Pago.

## Desenvolvimento

```sh
npm install
npm run cms          # terminal 1 — Decap local (grava no disco)
npm run dev          # terminal 2 — http://localhost:4321/frreinert/
```

Admin local: http://localhost:4321/frreinert/admin/

Se o content layer ficar desatualizado: `npm run dev:fresh`.

## Mídia pesada (R2)

Imagens de publicações e áudio ficam no bucket **`frreinert-media`**, servidos pelo Worker **`frreinert-media`**.

1. No CMS, faça upload normalmente (staging em `public/images` e `public/audio`).
2. Publique/salve o `.md` da publicação.
3. Sincronize para o R2:

```sh
npm run sync-media
# ou: npm run sync-media -- --dry-run
```

4. Em produção o build usa `PUBLIC_MEDIA_BASE` (ver `.env.example` e o workflow de deploy). Localmente, copie:

```sh
cp .env.example .env
```

Deploy do Worker (quando o código em `workers/frreinert-media` mudar):

```sh
cd workers/frreinert-media && npm ci && npx wrangler deploy
```

Markdown das publicações permanece no Git; só os binários vão para o R2.

## Scripts úteis

| Comando | Ação |
| --- | --- |
| `npm run dev` | Dev server Astro |
| `npm run build` | Build estático |
| `npm run cms` | Proxy Decap local |
| `npm run sync-media` | Sobe `public/images` + `public/audio` → R2 |
| `npm run optimize-images` | Otimiza pasta de fotos para upload |
| `npm run sync-catalog` | Sync catálogo de eventos → API Worker |
