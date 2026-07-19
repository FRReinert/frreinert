# Web Push (OneSignal)

Notificações no navegador quando sai uma **nova** publicação ou moment. O feed RSS em `/rss.xml` continua para leitores; o push é separado.

Setup oficial: [Web SDK setup](https://documentation.onesignal.com/docs/en/web-sdk-setup) · App ID em `src/lib/site/push.ts`.

## Visão rápida

```text
Visitante clica “Ativar notificações” no rodapé
  → OneSignal grava a inscrição

Você: npm run publish:post ou publish:moment → push do .md novo → deploy Pages
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

Só quando o commit em `main` **adiciona** um `.md` novo em `src/content/publicacoes/` ou `src/content/moments/`.

## iPhone / iPad (iOS 16.4+)

No Mac/Windows o opt-in na aba do browser funciona. **No iPhone não:** a Apple só libera Web Push depois que o site vira app na Tela de Início.

1. Safari/Chrome/Edge no iPhone → site → **Compartilhar** → **Adicionar à Tela de Início**.
2. Abrir pelo **ícone** (não pela aba do browser).
3. Rodapé → **Ativar notificações** → Allow.

O botão no rodapé detecta iOS na aba do browser e mostra esse caminho em vez de falhar com “Tentar de novo”.

Ref: [Web push for iOS (OneSignal)](https://documentation.onesignal.com/docs/en/web-push-for-ios).

## Troubleshoot

| Sintoma | Checagem |
| --- | --- |
| iPhone: “Tentar de novo” / falha ao ativar | Abrir pelo ícone da Tela de Início (não na aba); iOS 16.4+ |
| “Aguardando…” sem prompt | Scope do SW deve ser `/` (não subdirectory); SW acessível na raiz |
| Prompt não abre | HTTPS, não anônimo; permissão do site no browser |
| SW 404 | `https://frreinert.com.br/OneSignalSDKWorker.js` |
| Action não envia | Secret `ONESIGNAL_REST_API_KEY` |
| Site URL mismatch | Dashboard = `https://frreinert.com.br` |
