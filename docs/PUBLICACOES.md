# Como publicar uma nova Publicação

Guia operacional: do CMS até a página no ar, com mídia no R2 e **sem** deixar binários pesados no GitHub.

## Visão rápida

```text
Otimizar fotos/áudio → Publicar no Decap → sync-media:prune → commit limpeza → push → conferir site
```

| O que fica no Git | O que vai para o R2 |
| --- | --- |
| Markdown em `src/content/publicacoes/` | Fotos em `images/uploads/...` |
| Paths no frontmatter (`cover`, `gallery`, `audio_file`) | Áudio em `audio/...` |

Em produção as URLs de mídia usam o Worker `https://frreinert-media.fabricio-reinert.workers.dev` (`PUBLIC_MEDIA_BASE`).

---

## 0. Pré-requisitos (uma vez)

No Mac, na pasta do repo:

```sh
npm install
npx wrangler login   # conta Cloudflare que tem o bucket frreinert-media
cp .env.example .env # para ver mídia no `npm run dev`
```

Confirme que o Worker de mídia está no ar (só precisa redeploy se mudar o código em `workers/frreinert-media`).

---

## 1. Preparar as fotos

Use JPEG web, sem marca d’água (marca d’água é só para fotos à venda em eventos).

```sh
npm run optimize-images -- --dir ./minhas-fotos
# saída padrão: ./minhas-fotos/optimized
```

Flags úteis: `--out ./prontas`, `--max-edge 2048`, `--quality 85`.

**Nomes:** prefira ASCII (`scrl-0122.jpg`), sem acentos nem espaços.

---

## 2. Preparar o áudio (se houver trilha)

O player só toca **MP3 real** (ou OGG). Arquivo baixado do YouTube com extensão `.mp3` muitas vezes é DASH/fMP4 e **não toca** no site.

```sh
# Se o arquivo for suspeito, converta:
ffmpeg -i entrada.qualquer -vn -codec:a libmp3lame -qscale:a 2 public/audio/nome-da-faixa.mp3
```

**Regras:**

- Nome **só ASCII**: `vava-ribeiro-calmaria.mp3` (sem `á`, espaços, etc.)
- Extensão `.mp3` e conteúdo MP3 de verdade (`file arquivo.mp3` deve dizer MPEG / layer III)
- Direitos de uso da faixa são seus

Spotify no CMS é só preview (~30s). Prefira o campo **Áudio da publicação** para loop completo.

---

## 3. Criar a publicação no Decap

### Opção A — Admin em produção (GitHub)

1. Abra `https://frreinert.github.io/frreinert/admin/` e autentique.
2. **Publicações → New Publicações**.
3. Preencha:
   - **Título**
   - **Slug (URL):** só `a-z`, `0-9` e hífen — ex. `sao-joao-timbo-2026`
   - **Data**, **Descrição**
   - **Capa** (upload)
   - **Carrossel** se for galeria tipo colagem
   - **Galeria** (uma foto por “Add foto”)
   - **Áudio da publicação** (MP3 preparado)
   - **Texto** (corpo)
4. **Publish** / salvar.

O Decap cria o `.md` e pode commitár as imagens/áudio no Git. Isso é normal — o próximo passo tira os binários.

### Opção B — Admin local

```sh
npm run cms   # terminal 1
npm run dev   # terminal 2
```

Admin: `http://localhost:4321/frreinert/admin/`  
Grava no disco; depois você mesmo faz commit + sync (passos 4–5).

---

## 4. Subir mídia para o R2 e limpar o Git

**Obrigatório** depois de cada publicação com fotos ou áudio novos.

```sh
git pull
npm run sync-media:prune
```

Isso:

1. Envia `public/images` + `public/audio` → bucket `frreinert-media`
2. Atualiza `.gitignore` se preciso
3. Apaga os binários pesados do working tree e do index do Git  
   (mantém `public/images/payment/*.svg`, `.gitkeep`, `placeholder.svg`)

Conferir sem alterar nada:

```sh
npm run sync-media -- --prune --dry-run
```

---

## 5. Commit da limpeza e push

```sh
git add -A
git status   # deve mostrar DELETE dos jpg/mp3 + o .md da publicação (se ainda não commitado)
git commit -m "Add publicação slug-aqui e prune media after R2 sync"
git push
```

O GitHub Actions faz o build/deploy do Pages. Aguarde o workflow em verde.

---

## 6. Conferir no ar

1. Página: `https://frreinert.github.io/frreinert/publicacoes/SEU-SLUG/`
2. Capa e galeria carregam (URLs em `frreinert-media.fabricio-reinert.workers.dev`)
3. Player **Trilha sonora** aparece no rodapé
4. Se o browser bloquear autoplay, clique em ▶ — o áudio deve tocar
5. Hard refresh (`Cmd+Shift+R`) se a página antiga estiver em cache

Teste direto do áudio (deve retornar `200` e `content-length`):

```sh
curl -sI "https://frreinert-media.fabricio-reinert.workers.dev/audio/seu-arquivo.mp3"
```

---

## Checklist (copie por publicação)

- [ ] Fotos otimizadas (`optimize-images`) e nomes ASCII
- [ ] Áudio é MP3 real, nome ASCII
- [ ] Slug sem acentos
- [ ] Publicado no Decap (capa + galeria + áudio + texto)
- [ ] `npm run sync-media:prune`
- [ ] Commit da limpeza + `git push`
- [ ] Deploy Pages OK
- [ ] Página, imagens e trilha conferidas no site

---

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| Imagens/áudio 404 no site | Não rodou o sync para o R2 | `npm run sync-media:prune` e push |
| Áudio não toca | Arquivo DASH/YouTube disfarçado de `.mp3` | Converter com `ffmpeg` e reenviar |
| Áudio 404 com acento no nome | Unicode NFD/NFC no R2 | Renomear para ASCII, sync de novo |
| Player some / some no refresh | Build antigo ou cache | Hard refresh; confirme deploy do Pages |
| Repo GitHub inchando | Binários commitados e nunca pruned | Sempre `sync-media:prune` após publicar |
| Local sem imagens | Sem `PUBLIC_MEDIA_BASE` | `cp .env.example .env` e `npm run dev` |

---

## O que **não** fazer

- Não commitar de propósito pastas cheias de JPG/MP3 “para o site funcionar” — em produção a mídia vem do R2.
- Não pular o `sync-media:prune` depois do Decap.
- Não usar nomes com acento em arquivos de áudio/imagem.
- Não confundir com **eventos** (fotos à venda): isso usa `npm run ingest-photos` e o fluxo em [COMMERCE.md](./COMMERCE.md).

---

## Comandos úteis

| Comando | Uso |
| --- | --- |
| `npm run optimize-images -- --dir ./pasta` | Preparar JPEGs para o CMS |
| `npm run sync-media` | Só upload → R2 |
| `npm run sync-media:prune` | Upload → R2 **e** limpa Git |
| `npm run cms` + `npm run dev` | Decap + site local |
| `cd workers/frreinert-media && npx wrangler deploy` | Redeploy do CDN de mídia |
