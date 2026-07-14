# frreinert-comments

Worker de comentários das publicações. Armazena tudo em KV (`COMMENTS`),
uma chave por publicação: `comments:<slug>` (array JSON).

## Rotas

| Rota | Descrição |
|------|-----------|
| `GET /api/comments?slug=<slug>` | Lista comentários da publicação |
| `POST /api/comments` | Cria comentário — body `{ slug, name, message, website }` |

O campo `website` é honeypot: se vier preenchido, responde ok sem gravar.

## Anti-spam

- Rate limit por IP: 1 comentário / 30s e máx. 10 / hora
- Honeypot no form
- Máx. 500 comentários por publicação
- CORS restrito a frreinert.com.br / localhost

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
