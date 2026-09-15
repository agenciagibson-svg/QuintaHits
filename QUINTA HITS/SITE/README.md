# QUINTA HITS — site oficial

Next.js 15 (App Router) · sem dependências além de React · identidade visual aplicada pelos valores exatos.

## Rodar

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

## O que muda onde

| Quero mudar | Arquivo |
|---|---|
| Casa, endereço, Instagram, link de reserva, horário padrão | `src/config/site.ts` (ou variáveis `NEXT_PUBLIC_*`) |
| Programação (artista da semana, tema, estilo, horário) | `src/data/programacao.json` |
| Cores, tipografia, formas (placa, aba, botões) | `src/app/globals.css` |
| Textos das seções da home | `src/app/page.tsx` |
| Logos e selo (SVG vetorial, traçado da prancha oficial) | `public/brand/` |

## Programação — formato de cada edição

```json
{
  "id": "2026-09-24",
  "data": "2026-09-24",
  "artista": "Nome do artista",
  "instagram": "handle_sem_arroba",
  "tema": "Quinta Hits Rock",
  "genero": "rock",
  "horario": "20h",
  "local": "Florindos Bar",
  "status": "confirmada",
  "destaque": ""
}
```

`genero`: `rock` · `pop-rock` (ROCK POP) · `hits` · `2000s` · `dj` (DJ VINYL) · `mpb` · `special` · `""`
Vertentes fixas: NETO FOG = `pop-rock` · Jhean Marcell = `2000s` · DJ Jabá = `dj`
`status`: `confirmada` · `a_confirmar` · `realizada` · `cancelada`

Quintas sem registro aparecem automaticamente como "line-up em breve".

## Dinâmico

- `/` e `/programacao` são regeneradas a cada 60 s (a próxima quinta e a contagem mudam sozinhas).
- Faixa "Hoje é quinta. Tem Quinta Hits." aparece só às quintas (fuso de Uberlândia).
- `GET /api/proxima` — próxima edição, contagem em segundos, link de reserva.
- `GET /api/programacao?limite=6` — próximas e anteriores em JSON.
- `/opengraph-image` — imagem de compartilhamento gerada com a próxima edição.

## Regras de marca que o código respeita

- Nome da empresa: **GIBSON PROMOÇÕES** (nunca "Produções").
- Paleta: `#17352B` `#F1E7D2` `#B84A32` `#D5A62A` `#171717`.
- Placa com canto reto embaixo à direita; aba de edição pendurada nesse canto.
- Comunicação institucional não depende do artista da semana.
