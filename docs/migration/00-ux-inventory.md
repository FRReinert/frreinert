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

### Rotas

| Rota | Arquivo | Deve permanecer? | Notas de UX |
| --- | --- | --- | --- |
| `/` (com base) | `src/pages/index.astro` | sim | |
| `/publicacoes/` | `src/pages/publicacoes/index.astro` | sim | |
| `/publicacoes/<slug>/` | `src/pages/publicacoes/[...slug].astro` | sim | carrossel, galeria, áudio, share |
| `/eventos/` | `src/pages/eventos/index.astro` | sim | |
| `/eventos/<slug>/` | `src/pages/eventos/[...slug].astro` | sim | previews + add to cart + screenshot guard |
| `/carrinho/` | `src/pages/carrinho.astro` | sim | |
| `/checkout/` | `src/pages/checkout.astro` | sim | OTP → API |
| `/pedido/` | `src/pages/pedido.astro` | sim | |
| `/minhas-fotos/` | `src/pages/minhas-fotos/*` | sim | magic link → API |
| `/admin/` | `public/admin/` | **remover** (passo 05) | |

### Comportamentos UX a preservar

| Comportamento | Onde | Critério de paridade |
| --- | --- | --- |
| Lista de publicações | index publicacoes | cards/links iguais |
| Detalhe: capa + galeria | PublicationMedia | imagens carregam do CDN |
| Carrossel (`carousel: true`) | PublicationMedia | mesmo comportamento visual |
| Vídeos YT/Vimeo/file | paths.parseVideo | embeds funcionam |
| Áudio sticky / fade | PublicationAudio | MP3 via CDN; Range ok |
| Spotify preview | publicação | só se sem audio_file prioritário |
| Share | PublicationShare | copy / redes |
| Evento: watermark preview | evento pages | |
| Add to cart / badge | AddToCartButton, CartBadge | localStorage |
| Checkout OTP + MP | checkout + API | **via frreinert-api intacto** |
| Minhas fotos / download | minhas-fotos + API | **via frreinert-api intacto** |
| ScreenshotGuard | eventos | cosmético, manter |

### Workers

| Worker | Destino |
| --- | --- |
| `frreinert-media` | **Remover** após CDN (passos 01 + 07) |
| `frreinert-decap-oauth` | **Remover** (passos 05 + 07) |
| `frreinert-api` | **Manter** (só 08 opcional) |

### Scripts

| Script | Destino |
| --- | --- |
| `optimize-images` | reusar no `publish:post` |
| `sync-media` / prune | absorver no `publish:post`; deprecar |
| `cms` | remover (05) |
| `ingest-photos` | manter (04) |
| `sync-catalog` | manter (04) |

## Restrições

- Não alterar código de app neste passo além de docs de inventário.
- Não inventar features novas.

## Definition of Done

- [ ] Tabela de rotas preenchida com paths reais
- [ ] Checklist UX completo e revisado contra componentes existentes
- [ ] Mapa Workers/scripts explícito (remover vs manter)
- [ ] Nenhuma mudança em `workers/frreinert-api`
