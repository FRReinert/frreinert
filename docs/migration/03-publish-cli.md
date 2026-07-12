# Passo 03 — CLI único de publicação (publicações)

## Prompt para o agente

```text
Você está no repo vng-fotolog, branch feat/jekyl-migration.

Leia obrigatoriamente:
- docs/migration/README.md
- docs/migration/TARGET-PUBLICACOES.md  (contrato do CLI — fonte da verdade)
- docs/migration/03-publish-cli.md
- scripts/optimize-blog-images.mjs
- scripts/sync-media.mjs
- src/content.config.ts
- exemplo: src/content/publicacoes/sao-joao-timbo-2026.md

Tarefa: implementar `npm run publish:post` conforme TARGET-PUBLICACOES.md.

Requisitos:
1. Otimizar imagens (reusar lógica de optimize-blog-images: --max-edge, --quality, --dry-run).
2. Validar MP3 real + nomes ASCII.
3. Upload para R2 bucket frreinert-media (wrangler r2 object put --remote).
4. Gerar/atualizar src/content/publicacoes/<slug>.md com frontmatter compatível.
5. NUNCA staged/commit de JPG/MP3; mídia só no R2.
6. Preferir keys images/uploads/... e audio/... para compatibilidade com conteúdo atual.
7. Manter `optimize-images` funcionando; deprecar sync-media no help/README mínimo se tocar.
8. Não remover Decap neste passo (05). Não alterar frreinert-api.
9. Script npm canônico: publish:post (NÃO usar o nome "publish" — conflita com npm publish).

Teste: dry-run completo; se wrangler autenticado, publish de teste em slug dedicado
(ex. migration-smoke-test) e confirmar .md + objetos no R2.

Definition of Done do arquivo 03 deve ficar satisfazível.
```

## Objetivo

Substituir o fluxo Decap → sync-media:prune por um único comando local.

## Contrato

Ver [TARGET-PUBLICACOES.md](./TARGET-PUBLICACOES.md) — flags, frontmatter, comportamento.

## Implementação sugerida

- Novo: `scripts/publish-publicacao.mjs`
- Extrair helpers compartilhados se útil: `scripts/lib/optimize-images.mjs`, `scripts/lib/r2-put.mjs`
- `package.json`:

```json
"publish:post": "node scripts/publish-publicacao.mjs"
```

Script npm canônico = `publish:post` (evita conflito com `npm publish`).

## Arquivos a criar/alterar

- `scripts/publish-publicacao.mjs` (novo)
- `package.json` (script)
- Possível refactor de `optimize-blog-images.mjs` / `sync-media.mjs`
- `.gitignore` — garantir cache local de optimize não versionado (ex. `.publish-cache/`)

## Restrições

- Não exigir Decap.
- Não alterar `workers/frreinert-api`.
- Não quebrar schema Zod de publicações.
- Não apagar publicações existentes.

## Definition of Done

- [ ] `npm run publish:post -- --help` documenta flags
- [ ] Dry-run lista optimize + keys R2 + path do `.md` sem efeitos
- [ ] Run real (ou documentado se sem credenciais) gera `.md` válido
- [ ] Nenhum binário de upload entra no `git status` como tracked
- [ ] Frontmatter passa no schema (`content.config.ts`)
- [ ] TARGET-PUBLICACOES.md alinhado ao nome real do script (`publish:post`)
