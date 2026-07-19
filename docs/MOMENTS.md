# Como publicar um Moment

Guia operacional. Um comando sobe a imagem ao R2 e gera o Markdown; o Git só versiona o `.md`.

## Visão rápida

```text
npm run publish:moment -- … → git push do .md → conferir site
```

| O que fica no Git | O que vai para o R2 (`frreinert-media`) |
| --- | --- |
| Markdown em `src/content/moments/` | Foto em `images/uploads/moments/<slug>.jpg` |
| `text`, `image`, `date` no frontmatter | — |

Um Moment é **1 imagem + texto plano** — sem negrito, itálico ou markdown. Emojis e quebras de linha são permitidos.

Comentários e compartilhamento funcionam como nas publicações. O slug de comentários no KV é `moment-<slug>` (ex.: `moment-por-do-sol`).

---

## Pré-requisitos

Mesmos de [PUBLICACOES.md](./PUBLICACOES.md):

```sh
npm install
npx wrangler login
cp .env.example .env
```

---

## Publicar um Moment novo

```sh
npm run publish:moment -- \
  --image ./foto.jpg \
  --slug por-do-sol \
  --text "Primeira linha 🌅\nSegunda linha"
```

Com título e descrição explícitos (opcionais — senão derivados do texto):

```sh
npm run publish:moment -- \
  --image ./foto.jpg \
  --slug por-do-sol \
  --text "Texto do moment..." \
  --title "Por do sol" \
  --description "Um momento no fim da tarde"
```

Para textos longos, use um arquivo:

```sh
npm run publish:moment -- \
  --image ./foto.jpg \
  --slug meu-moment \
  --text-file ./texto.txt
```

---

## Atualizar um Moment existente

```sh
npm run publish:moment -- \
  --image ./nova-foto.jpg \
  --slug por-do-sol \
  --text "Texto atualizado" \
  --update
```

---

## Flags úteis

| Flag | Descrição |
| --- | --- |
| `--date YYYY-MM-DD` | Data do moment (default: agora, -03:00) |
| `--dry-run` | Simula sem R2 nem `.md` |
| `--skip-upload` | Escreve `.md` sem subir ao R2 (dev local) |
| `--push` | `git add` + commit + push só do `.md` |
| `--help` | Ajuda completa |

---

## Conferir no site

- Home: aparece na grade **Recentes** e na seção **Moments**
- Página dedicada: `https://frreinert.com.br/moments/<slug>/`
- Índice: `https://frreinert.com.br/moments/`

---

## O que NÃO fazer

- Não commitar JPG/PNG no Git — mídia só no R2
- Não usar markdown no texto (`**negrito**`, `# título`, etc.) — será exibido literalmente se escapar validação
