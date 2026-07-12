# Passo 04 — Eventos: alinhar CLI sem quebrar comércio

## Prompt para o agente

```text
Você está no repo vng-fotolog, branch feat/jekyl-migration.

Leia: docs/migration/README.md, docs/migration/04-eventos-cli.md,
docs/COMMERCE.md, scripts/ingest-event-photos.mjs, scripts/sync-catalog.mjs.

Tarefa:
1. Manter ingest-photos + sync-catalog funcionalmente iguais (previews watermark,
   highres no R2 privado frreinert-photos, markdown em src/content/eventos/,
   catalog.json → frreinert-api).
2. Opcional mas desejável: alias npm run publish:evento → ingest-photos.
3. Documentar no próprio 04 (seção Notas) a sequência pós-ingest
   (sync-catalog + wrangler deploy do API) sem alterar o Worker.
4. NÃO mudar contratos HTTP do frreinert-api nem catalog schema de forma breaking.
5. NÃO misturar bucket público (frreinert-media) com highres privado.

Se o CLI publish:post (passo 03) puder ter um subcomando "evento", só faça se
for thin wrapper; preferir scripts separados + aliases.
```

## Objetivo

Operador usa CLI para eventos com a mesma clareza do fluxo de publicações, sem regressão no comércio.

## Contexto

Hoje:

```sh
npm run ingest-photos -- --dir ./inbox/evento --title "..." --price 6
npm run sync-catalog
cd workers/frreinert-api && npx wrangler deploy
```

Previews públicos podem ir a `public/` / mídia pública; highres fica em `frreinert-photos` e só baixa via API autenticada.

## Trabalho esperado

1. Verificar que `ingest-photos` ainda documenta flags no `--help`.
2. Adicionar em `package.json`: `"publish:evento": "node scripts/ingest-event-photos.mjs"` (ou equivalente).
3. Atualizar comentários de cabeçalho do ingest para apontar o alias e avisar que **não** é o fluxo de publicações.
4. Smoke: dry-run de ingest (se suportado) ou checklist manual documentado.

## Arquivos

- `scripts/ingest-event-photos.mjs`
- `scripts/sync-catalog.mjs`
- `package.json`
- `workers/frreinert-api/catalog.json` (só se ingest de teste; evitar commit acidental de lixo)
- `docs/COMMERCE.md` — ajuste mínimo de referência ao alias (docs completas no 06)

## Restrições

- **Não** alterar lógica de preço/highresKey no Worker.
- **Não** tornar highres público.
- Não remover Decap ainda se eventos ainda dependem dele na doc — mas o caminho oficial passa a ser CLI.

## Notas (sequência operacional)

### Publicação (blog) vs evento (comércio)

| Fluxo | Comando | Bucket | Resultado |
| --- | --- | --- | --- |
| Publicação | `npm run publish:post` | **público** `frreinert-media` (`images/uploads/`, `audio/`) | `.md` em `src/content/publicacoes/` |
| Evento | `npm run publish:evento` (= `ingest-photos`) | **privado** `frreinert-photos` (highres); previews em `public/images/uploads/eventos/` | `.md` em `src/content/eventos/` + `catalog.json` |

Não misturar buckets. Highres de evento **nunca** vai para `frreinert-media`.

### Sequência pós-ingest (sem alterar o Worker)

```sh
# 1. Ingest (preview watermark + highres privado + markdown + sync-catalog embutido)
npm run publish:evento -- --dir ./inbox/meu-evento \
  --title "Meu Evento" --price 6

# Dry-run (nada gravado):
npm run publish:evento -- --dir ./inbox/meu-evento --dry-run

# 2. Revisar
#    - src/content/eventos/<eventId>.md
#    - public/images/uploads/eventos/<eventId>/*.jpg  (previews)
#    - workers/frreinert-api/src/catalog.json          (gerado no passo 1)

# 3. Commit/push do site (markdown + previews públicos; sem highres)

# 4. Redeploy do API para o Worker carregar o catálogo novo
cd workers/frreinert-api && npx wrangler deploy
```

`sync-catalog` também pode rodar sozinho: `npm run sync-catalog` (útil se o `.md` foi editado à mão).

Contratos HTTP do `frreinert-api` e formato do `catalog.json` permanecem iguais (passo 04 = aliases + docs).

### Smoke (2026-07-11)

- `npm run publish:evento -- --help` OK
- Dry-run com pasta temporária OK (lista preview + key `eventos/<id>/…` no bucket privado)
- Nenhum arquivo em `workers/frreinert-api/src/` alterado neste passo (exceto se um ingest real regenerar catalog — evitar commit de lixo de teste)

## Definition of Done

- [x] `npm run publish:evento -- --help` (ou ingest) funciona
- [x] Fluxo documentado: ingest → sync-catalog → deploy API
- [x] Nenhum breaking change em `frreinert-api`
- [x] Distinção clara publicação (`publish:post`) vs evento (`publish:evento`)
