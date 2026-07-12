# Passo 00 — Inventário de UX e mapa remove/mantém

## Prompt para o agente

```text
Você está no repo vng-fotolog, branch feat/jekyl-migration.

Leia e siga: docs/migration/README.md e docs/migration/00-ux-inventory.md.

Tarefa: completar o inventário de paridade UX e o mapa do que remove/mantém.
NÃO altere código de produção ainda (workers, pages, scripts), salvo se precisar
criar/atualizar apenas este arquivo de inventário em docs/migration/.

Entregáveis:
1. Preencher a seção "Inventário preenchido" abaixo neste mesmo arquivo
   (ou em docs/migration/00-inventory-filled.md se preferir não editar o prompt).
2. Confirmar rotas, componentes, Workers e scripts com paths reais do repo.
3. Marcar Definition of Done.

Restrições:
- Não tocar workers/frreinert-api
- Não fazer cutover / merge em main
- Não remover Decap ainda (isso é o passo 05)
```

## Objetivo

Congelar o que a migração **deve preservar** na experiência do usuário e o que pode sair.

## Contexto

- Site: Astro estático, `base: /frreinert`, GitHub Pages.
- Publicações: markdown em `src/content/publicacoes/`, schema em `src/content.config.ts`.
- Comércio: páginas estáticas + `workers/frreinert-api` (manter).
- Dor atual: Decap + prune + Worker de mídia (ver `docs/PUBLICACOES.md`).

## Arquivos a inspecionar

- `src/pages/**`
- `src/components/**`
- `src/content.config.ts`
- `src/lib/paths.ts`, `src/lib/cart.ts`, `src/lib/session.ts`
- `workers/frreinert-media/`, `workers/frreinert-decap-oauth/`, `workers/frreinert-api/` (só leitura)
- `public/admin/`
- `scripts/*`
- `docs/PUBLICACOES.md`, `docs/COMMERCE.md`

## Inventário preenchido (agente preenche)

> Congelado em 2026-07-11 no branch `feat/jekyl-migration`.  
> Site: Astro 7 estático, `base: /frreinert`, `site: https://frreinert.github.io` (`astro.config.mjs`).  
> URLs públicas = `https://frreinert.github.io/frreinert` + rota abaixo.

### Rotas

| Rota (após base) | Arquivo | Deve permanecer? | Notas de UX |
| --- | --- | --- | --- |
| `/` | `src/pages/index.astro` | **sim** | Home: intro + grid das 6 publicações mais recentes (`getCollection('publicacoes')`), capa via `assetUrl`, link “Ver todas” |
| `/publicacoes/` | `src/pages/publicacoes/index.astro` | **sim** | Grid completo: capa 3:4, data pt-BR, título, descrição |
| `/publicacoes/<slug>/` | `src/pages/publicacoes/[...slug].astro` | **sim** | Capa full-bleed, share, corpo MD, `PublicationMedia` (galeria/carrossel/vídeos), `PublicationAudio`; slug = `item.id` do content loader |
| `/eventos/` | `src/pages/eventos/index.astro` | **sim** | Lista de eventos + contagem de fotos; inclui `ScreenshotGuard` |
| `/eventos/<slug>/` | `src/pages/eventos/[...slug].astro` | **sim** | Capa, location, corpo, grid de previews com preço + `AddToCartButton` + `ScreenshotGuard` |
| `/carrinho/` | `src/pages/carrinho.astro` | **sim** | Lista localStorage (`frreinert-cart-v2`), total, limpar, CTA checkout |
| `/checkout/` | `src/pages/checkout.astro` | **sim** | OTP e-mail → confirma → Preference MP via `src/lib/mercadopago.ts` → `frreinert-api` |
| `/pedido/` | `src/pages/pedido.astro` | **sim** | Status por `ref`/`payment_id` (`GET /api/orders`); links download / Minhas fotos |
| `/minhas-fotos/` | `src/pages/minhas-fotos/index.astro` | **sim** | Pede magic link (`POST /api/auth/magic-link`) |
| `/minhas-fotos/acesso/` | `src/pages/minhas-fotos/acesso.astro` | **sim** | Consome token → `POST /api/auth/session` → sessão em `src/lib/session.ts` |
| `/minhas-fotos/biblioteca/` | `src/pages/minhas-fotos/biblioteca.astro` | **sim** | `GET /api/my-orders` + downloads (`GET /api/download`) |
| `/admin/` | `public/admin/index.html` + `public/admin/config.yml` | **remover** (passo 05) | Decap CMS; OAuth via `frreinert-decap-oauth`; **não remover neste passo** |

Layout / chrome global (não é rota, mas UX obrigatória):

| Peça | Arquivo | Destino |
| --- | --- | --- |
| Shell (nav, main, back-to-top) | `src/layouts/Layout.astro` | **manter** — brand “Fabricio Reinert”, links Publicações / Eventos / Minhas fotos / Carrinho |
| Footer | `src/components/SiteFooter.astro` | **manter** |
| Estilos | `src/styles/global.css` | **manter** |

### Componentes e libs (paridade)

| Artefato | Path | Destino | Papel na UX |
| --- | --- | --- | --- |
| Galeria / carrossel / vídeos | `src/components/PublicationMedia.astro` | **manter** | Grid 2-col ou carrossel swipe/setas (`carousel: true`); embeds YT/Vimeo/file via `parseVideo` |
| Áudio sticky | `src/components/PublicationAudio.astro` | **manter** | Player fixo bottom, loop + fade-in ~1.8s; `crossorigin=anonymous` (CORS/Range no CDN) |
| Share | `src/components/PublicationShare.astro` | **manter** | X, WhatsApp, copiar (Instagram), Threads |
| Add to cart | `src/components/AddToCartButton.astro` | **manter** | Feedback “Adicionado” ~1.2s |
| Badge carrinho | `src/components/CartBadge.astro` | **manter** | Contador via evento `cart:updated` |
| Screenshot guard | `src/components/ScreenshotGuard.astro` | **manter** | Overlay blur cosmético em páginas de eventos |
| Paths / mídia | `src/lib/paths.ts` | **manter** (só muda valor de `PUBLIC_MEDIA_BASE` nos passos 01–02) | `withBase`, `assetUrl` (`images/` + `audio/` → CDN), `parseVideo` |
| Spotify | `src/lib/spotify.ts` | **manter** | Preview só se não houver `audio_file` |
| Carrinho | `src/lib/cart.ts` | **manter** | localStorage `frreinert-cart-v2`; preço UI only |
| Sessão fotos | `src/lib/session.ts` | **manter** | `frreinert-photos-session-v1` |
| Cliente API comércio | `src/lib/mercadopago.ts` | **manter** | Default `https://frreinert-api.fabricio-reinert.workers.dev` |
| Schema conteúdo | `src/content.config.ts` | **manter** | Collections `publicacoes` + `eventos` |
| Markdown publicações | `src/content/publicacoes/*.md` | **manter** | Ex.: `sao-joao-timbo-2026.md` |
| Markdown eventos | `src/content/eventos/*.md` | **manter** | Pasta existe (hoje só `.gitkeep`); gerada por `ingest-photos` |

### Comportamentos UX a preservar

| Comportamento | Onde (path real) | Critério de paridade |
| --- | --- | --- |
| Home com recentes | `src/pages/index.astro` | Mesmos cards (capa 3:4, título, descrição) e “Ver todas” |
| Lista de publicações | `src/pages/publicacoes/index.astro` | Grid idêntico; ordenação por data desc |
| Detalhe: capa + corpo | `src/pages/publicacoes/[...slug].astro` | Capa `max-h-[75vh]`, prose, padding bottom se há áudio |
| Galeria estática | `PublicationMedia.astro` (`carousel: false`) | Grid 2-col, `assetUrl` |
| Carrossel | `PublicationMedia.astro` (`carousel: true`) | Faixa contínua, snap, setas desktop, swipe touch |
| Vídeos YT/Vimeo/file | `src/lib/paths.ts` → `parseVideo` | Embeds iframe ou `<video>` via CDN |
| Áudio sticky / fade | `PublicationAudio.astro` | MP3 via CDN; Range/CORS ok (hoje Worker; alvo CDN R2 público) |
| Spotify preview | `PublicationAudio.astro` + `spotify.ts` | Só se `audio_file` ausente; embed compact dark |
| Share | `PublicationShare.astro` | Copy + redes sem regressão |
| Lista eventos | `src/pages/eventos/index.astro` | Cards + contagem de fotos |
| Preview com marca d’água | `eventos/[...slug].astro` + paths `photo.preview` | Imagem já watermarked no asset (não CSS); preço `formatBRL` |
| Add to cart / badge | `AddToCartButton.astro`, `CartBadge.astro`, `cart.ts` | Persistência localStorage; badge atualiza |
| Carrinho → checkout | `carrinho.astro` → `checkout.astro` | Fluxo visual intacto |
| Checkout OTP + MP | `checkout.astro` + `mercadopago.ts` + **`workers/frreinert-api`** | OTP + Preference + webhook; **API intacta** |
| Página de pedido | `pedido.astro` + `GET /api/orders` | Status e downloads pós-pagamento |
| Minhas fotos / download | `minhas-fotos/*` + magic link / session / download na API | **via frreinert-api intacto**; bucket privado `frreinert-photos` |
| ScreenshotGuard | `ScreenshotGuard.astro` em ambas rotas de eventos | Cosmético; manter |
| Nav + footer + back-to-top | `Layout.astro`, `SiteFooter.astro` | Brand e links iguais |

### Workers

| Worker | Path no repo | URL atual | Destino |
| --- | --- | --- | --- |
| `frreinert-media` | `workers/frreinert-media/` (`wrangler.toml`, `src/index.ts`) | `https://frreinert-media.fabricio-reinert.workers.dev` (= `PUBLIC_MEDIA_BASE` em `.env.example` e `.github/workflows/deploy.yml`) | **Remover** após CDN R2 público (passos 01 + 07). Serve `images/*` + `audio/*` com Range/CORS. |
| `frreinert-decap-oauth` | `workers/frreinert-decap-oauth/` | `https://frreinert-decap-oauth.fabricio-reinert.workers.dev` (também em `public/admin/config.yml` `base_url`) | **Remover** (passos 05 + 07). Não remover no passo 00. |
| `frreinert-api` | `workers/frreinert-api/` | `https://frreinert-api.fabricio-reinert.workers.dev` | **Manter** (hardening opcional só no 08). Endpoints: `/api/checkout`, `/api/webhooks/mercadopago`, `/api/orders`, `/api/download`, `/api/auth/email-otp`, `/api/auth/email-otp/confirm`, `/api/auth/magic-link`, `/api/auth/session`, `/api/my-orders`. R2 privado `frreinert-photos` + KV ORDERS. |

### Scripts (npm → arquivo)

| npm script (`package.json`) | Arquivo | Destino |
| --- | --- | --- |
| `optimize-images` | `scripts/optimize-blog-images.mjs` | **Reusar** dentro de `publish:post` (passo 03); CLI pode continuar exposto |
| `sync-media` / `sync-media:prune` | `scripts/sync-media.mjs` | **Absorver** upload R2 no `publish:post`; **deprecar** prune pós-cutover (mídia deixa de entrar no Git) |
| `cms` | `npx decap-server` (sem arquivo próprio) | **Remover** no passo 05 com `public/admin/` |
| `ingest-photos` | `scripts/ingest-event-photos.mjs` | **Manter** (passo 04: aliases/docs opcionais) |
| `sync-catalog` | `scripts/sync-catalog.mjs` | **Manter** — gera `workers/frreinert-api/src/catalog.json` a partir de `src/content/eventos/*.md` |
| *(novo)* `publish:post` | a criar no passo 03 | Contrato em `docs/migration/TARGET-PUBLICACOES.md` |

### O que remove vs mantém (resumo)

| Camada | Remover (passos futuros) | Manter |
| --- | --- | --- |
| UX / Pages | só `/admin/` | todas as rotas de conteúdo e comércio listadas acima |
| CMS | Decap (`public/admin/`), `npm run cms`, Worker OAuth | markdown em `src/content/**` + schema |
| Mídia pública | Worker `frreinert-media`; fluxo Decap→Git→prune | bucket R2 `frreinert-media`, `assetUrl` / `PUBLIC_MEDIA_BASE` (apontando para CDN) |
| Publicação | sync-media:prune como passo humano | CLI `publish:post` + push do `.md` |
| Comércio | — | `frreinert-api`, `frreinert-photos`, páginas carrinho/checkout/pedido/minhas-fotos, `ingest-photos`, `sync-catalog` |
| Build/deploy | valor `PUBLIC_MEDIA_BASE` apontando ao Worker (trocar no 02/07) | GitHub Pages workflow (estrutura); Astro SSG |

### Fora de escopo deste inventário (não inventar)

- Não migrar para Jekyll.
- Não alterar `workers/frreinert-api` neste passo (nem no cutover, salvo 08).
- Não fazer cutover / merge em `main` (passo 07).
- Não remover Decap ainda (passo 05).

## Restrições

- Não alterar código de app neste passo além de docs de inventário.
- Não inventar features novas.

## Definition of Done

- [x] Tabela de rotas preenchida com paths reais
- [x] Checklist UX completo e revisado contra componentes existentes
- [x] Mapa Workers/scripts explícito (remover vs manter)
- [x] Nenhuma mudança em `workers/frreinert-api`
