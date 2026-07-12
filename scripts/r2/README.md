# R2 CORS — frreinert-media

Política aplicada ao bucket público `frreinert-media` (passo 01). Preservada aqui após remoção do Worker `frreinert-media` (passo 07).

```sh
npx wrangler r2 bucket cors set frreinert-media \
  --file scripts/r2/frreinert-media-cors.json --force
```
