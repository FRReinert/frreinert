# Web Push (OneSignal)

Notificações no navegador quando sai uma **nova** publicação. O feed RSS em `/rss.xml` continua para leitores; o push é separado.

Setup oficial: [Web SDK setup](https://documentation.onesignal.com/docs/en/web-sdk-setup) · App ID em `src/lib/push.ts`.

## Visão rápida

```text
Visitante clica “Ativar notificações” no rodapé
  → OneSignal grava a inscrição

Você: npm run publish:post → push do .md novo → deploy Pages
  → Action `notify` chama a API OneSignal → push nos inscritos
```

## Dashboard (uma vez)

1. [onesignal.com](https://onesignal.com) → app Web → **Custom Code**.
2. **Site URL:** `https://frreinert.com.br` (exato, sem `www`).
3. **Auto Resubscribe:** on.
4. **Default Icon:** ex. `https://frreinert.com.br/apple-touch-icon.png`.
5. Service worker (Advanced): path `/push/onesignal/`, arquivo `OneSignalSDKWorker.js`, scope `/push/onesignal/`  
   (já configurado no `OneSignal.init` do site).
6. Desative prompts automáticos (slide/bell) se aparecerem — o opt-in é o botão do rodapé.
7. Em **Settings → Keys & IDs**, copie a **Rest API Key**.

## GitHub (uma vez)

| Tipo | Nome | Valor |
| --- | --- | --- |
| Secret | `ONESIGNAL_REST_API_KEY` | Rest API Key |

O App ID de produção já está no código (`9809d357-…`). Opcional: variable `PUBLIC_ONESIGNAL_APP_ID` só para override.

## Conferir

1. Deploy deste código.
2. `https://frreinert.com.br/push/onesignal/OneSignalSDKWorker.js` deve mostrar o `importScripts`.
3. Site (não anônimo) → rodapé → **Ativar notificações** → Allow.
4. OneSignal → **Audience → Subscriptions**.

Teste de envio (dry-run):

```sh
ONESIGNAL_REST_API_KEY=... npm run notify:posts -- --dry-run src/content/publicacoes/sao-joao-timbo-2026.md
```

## Quando o push dispara

Só quando o commit em `main` **adiciona** um `.md` em `src/content/publicacoes/`. Edições (`--update`) não notificam.

## iOS Safari

Web Push no iPhone exige iOS 16.4+ e o site na Tela de Início. O `manifest.webmanifest` já está linkado no layout.

## Troubleshoot

| Sintoma | Checagem |
| --- | --- |
| Prompt não abre | HTTPS, não anônimo; permissão do site nas settings do browser |
| SW 404 | URL do worker acima |
| Action não envia | Secret `ONESIGNAL_REST_API_KEY` |
| Site URL mismatch | Dashboard = `https://frreinert.com.br` |
