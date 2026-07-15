# Comércio de fotos + Mercado Pago + Cloudflare

CMS web removido. Eventos (fotos à venda) e o catálogo da API usam só CLI. O Worker **`frreinert-api`** permanece o backend de checkout, OTP, webhook e download — sem mudança de contrato neste playbook.

## Eventos (fotos à venda)

Caminho oficial: `npm run publish:evento`.

```bash
npm run publish:evento -- --dir ./inbox/casamento-ana-pedro \
  --title "Casamento Ana & Pedro" \
  --price 6 \
  --location "Porto Alegre, RS"
```

Uma pasta local = um evento (o nome da pasta vira o `eventId`).

O script:

1. Gera preview 800px com marca d'água em `public/images/uploads/eventos/{eventId}/`
2. Atualiza `src/content/eventos/{eventId}.md`
3. Sobe a alta no R2 **privado** `frreinert-photos` (`eventos/{eventId}/{codigo}.jpg`) — requer `wrangler` logado
4. Roda `sync-catalog` → `workers/frreinert-api/src/catalog.json`

Flags úteis: `--dry-run`, `--skip-r2`, `--max-edge 800`.

**Não** confundir com publicações do blog (`npm run publish:post` → bucket público `frreinert-media`). Ver [PUBLICACOES.md](./PUBLICACOES.md).

Depois do ingest:

```bash
# sync-catalog já roda no ingest (exceto --dry-run); redeploy carrega o catálogo no Worker:
cd workers/frreinert-api && npx wrangler deploy
```

Se editar o `.md` do evento à mão: `npm run sync-catalog` e redeploy.

- Preço e `highresKey` são resolvidos no **Worker** via `catalog.json` (não confiar no browser)
- Preview público deve ser arquivo **já com marca d'água** (CSS não protege)
- Em repo público, `highresKey` no markdown/catalog é visível — a proteção real é o arquivo privado no R2

## Status

| Etapa | Status |
|-------|--------|
| Carrinho + checkout UI | Pronto |
| E-mail no checkout | Pronto |
| Worker cria Preference (Checkout Pro) | Pronto |
| Preço/highres no servidor | Pronto |
| KV ORDERS (pedidos + índice por e-mail) | Pronto |
| Retorno para `/pedido/` + botão Baixar | Pronto |
| Webhook + e-mail pós-pagamento (Resend) | Pronto (configure a API key) |
| Minhas fotos (magic link) | Pronto |
| Download via R2 | Pronto |

## Fluxo do cliente

1. Checkout informa **e-mail** → recebe OTP → confirma → Worker grava pedido em KV + índice `email:{email}`
2. Carrinho é zerado ao abrir o Mercado Pago (mesmo se não voltar ao site)
3. Paga no Mercado Pago (pode ficar no comprovante sem voltar ao site)
4. Webhook marca `approved` e envia e-mail com link do pedido + Minhas fotos
5. Em `/minhas-fotos/` o cliente pede um magic link → confirma em `/minhas-fotos/acesso/` → biblioteca com downloads

## Secrets / vars do Worker

```bash
cd workers/frreinert-api
npx wrangler secret put MERCADOPAGO_ACCESS_TOKEN
npx wrangler secret put MERCADOPAGO_WEBHOOK_SECRET
npx wrangler secret put RESEND_API_KEY
```

No `wrangler.toml`:

- `SITE_URL` — URL pública do site
- `FROM_EMAIL` — `pedidos@vanguardab2b.com.br` (domínio verificado no Resend)

Webhook Mercado Pago — configure a assinatura secreta:

```bash
npx wrangler secret put MERCADOPAGO_WEBHOOK_SECRET
```

(cole a “Assinatura secreta” do painel de Webhooks do MP)

## Mercado Pago — webhook

URL:

```text
https://frreinert-api.fabricio-reinert.workers.dev/api/webhooks/mercadopago
```

Eventos: pagamentos (`payment`).

**Obrigatório:** `MERCADOPAGO_WEBHOOK_SECRET` configurado. Requests sem `x-signature` válida são rejeitados (401).

Downloads de alta resolução exigem sessão de **Minhas fotos** (magic link) ou token de download de curta duração — `ref`/`payment_id` sozinhos não bastam.

## Redeploy

```bash
npm run sync-catalog
cd workers/frreinert-api && npx wrangler deploy
```

## KV ORDERS

Já bound no `wrangler.toml`. Chaves:

- `order:{ref}` — pedido (inclui `email`, `emailSentAt`)
- `email:{email}` — lista de refs
- `magic:{token}` — TTL 15 min
- `session:{token}` — TTL 7 dias

## R2 (fotos em alta)

Bucket: **`frreinert-photos`** (privado), binding `PHOTOS`.

```bash
cd workers/frreinert-api
npx wrangler r2 object put frreinert-photos/eventos/casamento-ana-pedro/ana-pedro-001.jpg \
  --file=./caminho/local/foto.jpg \
  --content-type=image/jpeg \
  --remote
```

Sem `--remote` o Wrangler grava só no R2 local.

## Teste rápido

1. `npm run dev` + Worker deployado com secrets
2. Checkout com seu e-mail → pagar no sandbox
3. Confirmar e-mail de “Pagamento confirmado” (mesmo sem voltar ao site)
4. Abrir Minhas fotos → magic link → Baixar
