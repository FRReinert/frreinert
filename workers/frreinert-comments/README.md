# frreinert-comments

Worker de comentários das publicações. Armazena tudo em KV (`COMMENTS`),
uma chave por publicação: `comments:<slug>` (array JSON).

## Rotas

| Rota | Descrição |
|------|-----------|
| `GET /api/comments?slug=<slug>` | Lista comentários da publicação |
| `POST /api/comments` | Cria comentário — body `{ slug, name, message, website, turnstileToken }` |

O campo `website` é honeypot: se vier preenchido, responde ok sem gravar.

## Anti-spam

- Cloudflare Turnstile (widget no form + siteverify no Worker)
- Rate limit por IP: 1 comentário / 30s e máx. 10 / hora
- Honeypot no form
- Máx. 500 comentários por publicação
- CORS e validação de `Origin` no servidor (POST) — frreinert.com.br / localhost:4321

## Turnstile (produção)

1. Dashboard → Turnstile → criar widget **Managed**, domínios:
   `frreinert.com.br`, `localhost`, `127.0.0.1`
2. Site key → GitHub repo **Variables** `PUBLIC_TURNSTILE_SITE_KEY` (build Pages) e `.env` local
3. Secret key → secret do Worker:

```bash
cd workers/frreinert-comments
echo '<secret>' | npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler deploy
```

Sem `TURNSTILE_SECRET_KEY` no Worker, a verificação fica desligada (útil só em dev).
Sem `PUBLIC_TURNSTILE_SITE_KEY` no build, o widget não aparece no form.

## Setup (uma vez)

```bash
cd workers/frreinert-comments
npm install
npx wrangler kv namespace create COMMENTS            # id → wrangler.toml [id]
npx wrangler kv namespace create COMMENTS --preview  # id → wrangler.toml [preview_id]
npx wrangler deploy
```

## Moderação (remover comentário)

Sem endpoint de admin — edição manual da chave no KV:

```bash
cd workers/frreinert-comments

# 1. Baixar o JSON da publicação
npx wrangler kv key get "comments:<slug>" --binding COMMENTS --remote --preview false > /tmp/comments.json

# 2. Editar /tmp/comments.json (remover o item indesejado)

# 3. Subir de volta
npx wrangler kv key put "comments:<slug>" --binding COMMENTS --remote --preview false --path /tmp/comments.json
```

Para apagar todos os comentários de uma publicação:

```bash
npx wrangler kv key delete "comments:<slug>" --binding COMMENTS --remote --preview false
```
