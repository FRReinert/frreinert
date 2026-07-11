# frreinert-api (Cloudflare Worker)

API de checkout Mercado Pago para o site estático.

## Deploy (substituir o Hello World)

```bash
cd workers/frreinert-api
npm install
npx wrangler login
npx wrangler deploy
```

URL esperada: `https://frreinert-api.fabricio-reinert.workers.dev`

Se o Worker no dashboard tiver **outro nome** (ex.: `silent-brook-154c`), ou renomeie no `wrangler.toml` (`name = "..."`), ou faça deploy com o mesmo nome do dashboard.

## Secrets

```bash
npx wrangler secret put MERCADOPAGO_ACCESS_TOKEN
# cole o Access Token de teste do Mercado Pago Developers

npx wrangler secret put MERCADOPAGO_WEBHOOK_SECRET
# assinatura secreta do webhook (obrigatória — requests sem assinatura são rejeitados)

npx wrangler secret put RESEND_API_KEY
```
## Teste rápido

```bash
curl https://frreinert-api.fabricio-reinert.workers.dev/
```

Deve retornar JSON com `mercadopagoConfigured: true/false`.
