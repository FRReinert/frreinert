# Comércio de fotos + Mercado Pago + Cloudflare

## Segurança (obrigatório)

- Preço e `highresKey` são resolvidos no **Worker** via `catalog.json` (não confiar no browser)
- Após editar eventos no CMS: `node scripts/sync-catalog.mjs` e `npx wrangler deploy`
- Configure a assinatura do webhook:

```bash
npx wrangler secret put MERCADOPAGO_WEBHOOK_SECRET
```

(cole a “Assinatura secreta” do painel de Webhooks do MP)

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

## Mercado Pago — webhook

URL:

```text
https://frreinert-api.fabricio-reinert.workers.dev/api/webhooks/mercadopago
```

Eventos: pagamentos (`payment`).

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
