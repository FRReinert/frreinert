# Passo 06 — Documentação operacional nova

## Prompt para o agente

```text
Você está no repo vng-fotolog, branch feat/jekyl-migration.

Pré-requisitos: 03–05 concluídos (CLI + Decap removido + CDN wired).

Leia: docs/migration/TARGET-PUBLICACOES.md, docs/migration/06-docs-rewrite.md,
docs/PUBLICACOES.md (antigo), README.md, docs/COMMERCE.md.

Tarefa:
1. Reescrever docs/PUBLICACOES.md com o conteúdo alvo de TARGET-PUBLICACOES.md,
   ajustado ao que foi REALMENTE implementado (nome do script, flags, CDN host).
2. Atualizar README.md: remover Decap/cms/sync-media:prune como fluxo principal;
   apontar publish:post + PUBLIC_MEDIA_BASE do CDN; link para PUBLICACOES.md.
3. Atualizar docs/COMMERCE.md: CMS Decap removido; eventos via publish:evento;
   frreinert-api inalterado.
4. Atualizar docs/migration/README.md se algum path/script divergiu.
5. Não implementar features novas; só docs (+ mini correções de comentários se preciso).
```

## Objetivo

Operador consegue publicar só lendo `docs/PUBLICACOES.md` (checklist curto).

## Fonte

Promover [TARGET-PUBLICACOES.md](./TARGET-PUBLICACOES.md) → [`docs/PUBLICACOES.md`](../PUBLICACOES.md), refletindo a implementação real.

## Conteúdo mínimo de PUBLICACOES.md

- Visão rápida: `publish:post` → push `.md` → conferir
- Pré-requisitos (npm, wrangler, `.env`)
- Flags do CLI
- Checklist por publicação
- Problemas comuns
- O que não fazer
- Link explícito: eventos ≠ publicações → COMMERCE / `publish:evento`

## Definition of Done

- [ ] `docs/PUBLICACOES.md` descreve só o fluxo novo (sem Decap/prune)
- [ ] `README.md` alinhado
- [ ] `COMMERCE.md` sem OAuth Decap; eventos via CLI
- [ ] Comandos no doc batem com `package.json`
- [ ] Host CDN documentado = valor em `.env.example` / deploy.yml
