# QUINTA HITS — site oficial

Next.js 15 (App Router) · Supabase (programação e dados da casa) · identidade visual aplicada pelos valores exatos.

## Rodar

```bash
npm install
npm run dev      # http://localhost:3000  ·  painel em /admin
npm run build
```

Variáveis (`.env.local` local e **Vercel → Settings → Environment Variables**; modelo em `.env.example`):

| Variável | O que é |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | chave **service_role** (não a anon) — só no servidor |
| `ADMIN_PASSWORD` | senha do painel `/admin` |
| `ADMIN_SESSION_SECRET` | segredo aleatório (32+ caracteres) que assina o login |

Banco: rode `supabase/schema.sql` no SQL Editor do Supabase (bancos antigos: `supabase/migracao-2026-09-15-checks.sql`).

## O que muda onde

| Quero mudar | Onde |
|---|---|
| Programação (artista da semana, tema, estilo, horário) | painel **`/admin`** |
| Endereço, bairro e Instagram da casa, link de reserva, horário padrão | painel **`/admin`** (valores fixos de reserva em `src/config/site.ts`) |
| Nome da casa, textos institucionais, hashtags | `src/config/site.ts` |
| Cores, tipografia, formas (placa, aba, botões) | `src/app/globals.css` |
| Textos das seções da home | `src/app/page.tsx` |
| Logos e selo (SVG vetorial, traçado da prancha oficial) | `public/brand/` |

## Programação — campos de cada edição

| Campo | Exemplo |
|---|---|
| `data` | `2026-09-24` — sempre uma quinta; é a chave da edição e não muda depois de criada |
| `artista` / `instagram` | `NETO FOG` / `netofog` (sem @) |
| `tema` | `Quinta Hits Pop Rock` |
| `horario` | `20h` ou `20h30` |
| `local` | `Florindos Bar` |
| `destaque` | texto curto opcional |

`genero`: `rock` · `pop-rock` (ROCK POP) · `hits` · `2000s` · `dj` (DJ VINYL) · `mpb` · `special` · `""`
Vertentes fixas: NETO FOG = `pop-rock` · Jhean Marcell = `2000s` · DJ Jabá = `dj`
`status`: `confirmada` · `a_confirmar` · `realizada` · `cancelada`

Quintas sem registro aparecem automaticamente como "line-up em breve".
**Quinta que NÃO vai ter edição precisa de um registro com `status: "cancelada"`** — sem
registro, o site assume que a quinta existe e cria o card sozinho.

## Dinâmico

- `/` e `/programacao` são regeneradas a cada 60 s (a próxima quinta e a contagem mudam sozinhas).
- A contagem regressiva aponta para a próxima EDIÇÃO real, pulando quintas canceladas.
- Faixa "Hoje é quinta. Tem Quinta Hits." aparece só nas quintas que têm edição (fuso de Uberlândia).
- `GET /api/proxima` — próxima edição, contagem em segundos, link de reserva.
- `GET /api/programacao?limite=6` — próximas e anteriores em JSON.
- `/opengraph-image` — imagem de compartilhamento gerada com a próxima edição.

## Regras de marca que o código respeita

- Nome da empresa: **GIBSON PROMOÇÕES** (nunca "Produções").
- Paleta: `#17352B` `#F1E7D2` `#B84A32` `#D5A62A` `#171717`.
- Placa com canto reto embaixo à direita; aba de edição pendurada nesse canto.
- Comunicação institucional não depende do artista da semana.
