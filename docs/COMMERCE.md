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
- Em repo público, `highresKey` no markdown/catalog é visível — a proteção real é o arquivo privado no Drive

## Status

| Etapa | Status |
|-------|--------|
| Carrinho + checkout UI | Pronto |
| Worker cria Preference (Checkout Pro) | Pronto |
| Preço/highres no servidor | Pronto |
| Retorno para `/pedido/` | Pronto |
| Webhook + validação de assinatura | Pronto (ative o secret) |
| Download Google Drive | Próximo |

## O que você faz agora no Mercado Pago

1. Painel Developers → sua aplicação → **Webhooks** (ou IPN / notificações)
2. URL:

```text
https://frreinert-api.fabricio-reinert.workers.dev/api/webhooks/mercadopago
```

3. Eventos: pagamentos (`payment`)

## Redeploy do Worker (obrigatório após estas mudanças)

```bash
cd workers/frreinert-api
npx wrangler deploy
```

## Teste

1. `npm run dev` na raiz do site  
2. Comprar no sandbox  
3. Após pagar, o MP deve voltar para  
   `https://frreinert.github.io/frreinert/pedido/?ref=...&status=success`  
   (em produção; localmente o `SITE_URL` do Worker ainda aponta para o GitHub Pages)

### Testar retorno no localhost

No `wrangler.toml`, temporariamente:

```toml
SITE_URL = "http://localhost:4321/frreinert"
```

Depois `npx wrangler deploy` de novo. Lembre de voltar para a URL de produção depois.

## KV (opcional, recomendado)

```bash
npx wrangler kv namespace create ORDERS
npx wrangler kv namespace create ORDERS --preview
```

Cole os IDs no `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "ORDERS"
id = "COLE_O_ID_AQUI"
preview_id = "COLE_O_PREVIEW_ID_AQUI"
```

Sem KV o fluxo ainda funciona: o front guarda o resumo do pedido no navegador e o webhook consulta o pagamento na API do MP.

## Próximo: Google Drive

Quando o webhook marcar `approved`, usar Service Account + `highresKey` para gerar link/download da alta.
