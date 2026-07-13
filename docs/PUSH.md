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
4. **Default Icon:** `https://frreinert.com.br/apple-touch-icon.png`.
5. **Service workers** — desligue “Customize…” **ou** use:
   - Path: `/`
   - Main: `OneSignalSDKWorker.js`
   - Updater: `OneSignalSDKUpdaterWorker.js`
   - Scope: `/`
6. Desative prompts automáticos (slide/bell) — o opt-in é o botão do rodapé.
7. **Settings → Keys & IDs** → Rest API Key → secret `ONESIGNAL_REST_API_KEY` no GitHub.

## Conferir

1. Deploy.
2. `https://frreinert.com.br/OneSignalSDKWorker.js` deve mostrar o `importScripts`.
3. Site em **produção** (não anônimo) → rodapé → **Ativar notificações** → Allow.
4. OneSignal → **Audience → Subscriptions**.

> Localhost: o Site URL do app é produção. Prefira testar no domínio real; em `localhost` use app OneSignal separado ou espere o SDK com `allowLocalhostAsSecureOrigin`.

## Quando o push dispara

Só quando o commit em `main` **adiciona** um `.md` em `src/content/publicacoes/`.

## Troubleshoot

| Sintoma | Checagem |
| --- | --- |
| “Aguardando…” sem prompt | Scope do SW deve ser `/` (não subdirectory); SW acessível na raiz |
| Prompt não abre | HTTPS, não anônimo; permissão do site no browser |
| SW 404 | `https://frreinert.com.br/OneSignalSDKWorker.js` |
| Action não envia | Secret `ONESIGNAL_REST_API_KEY` |
| Site URL mismatch | Dashboard = `https://frreinert.com.br` |
