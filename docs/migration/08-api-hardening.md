# Passo 08 (opcional) — Endurecimento de custos no `frreinert-api`

## Prompt para o agente

```text
Você está no repo vng-fotolog, branch feat/jekyl-migration (ou main pós-merge).

Este passo é OPCIONAL e SEPARADO da migração estática.
Só execute se o humano pedir explicitamente.

Leia: docs/migration/08-api-hardening.md, docs/COMMERCE.md,
workers/frreinert-api/src/index.ts (OTP, magic link, download rate limits).

Tarefa: reduzir abuso/brute-force que gera custo (Resend, CPU Worker, R2):
1. Auditar rate limits atuais (OTP send, confirm attempts, magic link, download).
2. Propor e, se aprovado no mesmo chat, implementar melhorias mínimas:
   - limites mais estritos por IP/email
   - backoff / lockout temporário
   - opcional: Cloudflare Turnstile no checkout / minhas-fotos (só se pedido)
3. Não quebrar UX legítima de compra.
4. Documentar mudanças em docs/COMMERCE.md.

Não reabrir Decap. Não recriar Worker de mídia.
```

## Objetivo

Mitigar brute force em OTP/magic link que pode gerar custo (e-mail Resend, invocações).

## Fora de escopo da migração estática

Este passo **não** bloqueia 00–07. Rodar só se ainda houver preocupação de custo na API.

## Áreas típicas a revisar

- `POST /api/auth/email-otp` e confirm
- Magic link issue/consume
- `GET /api/download` rate limit por IP
- Respostas genéricas (evitar user enumeration) — manter

## Definition of Done

- [ ] Auditoria escrita (limites antes/depois)
- [ ] Mudanças mínimas deployadas **só se** o humano aprovou
- [ ] COMMERCE.md atualizado
- [ ] Teste: usuário legítimo ainda completa OTP
