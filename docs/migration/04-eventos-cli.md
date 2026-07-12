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

## Definition of Done

- [ ] `npm run publish:evento -- --help` (ou ingest) funciona
- [ ] Fluxo documentado: ingest → sync-catalog → deploy API
- [ ] Nenhum breaking change em `frreinert-api`
- [ ] Distinção clara publicação (`publish:post`) vs evento (`publish:evento`)
