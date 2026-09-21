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
| `ADMIN_EMAILS` | e-mails que entram no painel `/admin` (a senha é a do usuário no Supabase Auth) |
| `ADMIN_SESSION_SECRET` | segredo aleatório (32+ caracteres) que assina o login |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | verificação "não sou robô" da reserva (Cloudflare Turnstile) |
| `WHATSAPP_*` | confirmação automática da reserva pelo WhatsApp — ver "Reserva de mesa" |

Banco: rode `supabase/schema.sql` no SQL Editor do Supabase (bancos antigos: rode as `supabase/migracao-*.sql` que faltarem, em ordem de data).

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

## Reserva de mesa (`/reservar`)

1. Cliente escolhe a quinta e uma mesa livre no mapa, informa nome, WhatsApp e pessoas, e passa pela verificação "não sou robô" (Cloudflare Turnstile).
2. O pedido nasce **aguardando**, com um código (ex.: `QH-482193`), e segura a mesa por **15 minutos**.
3. O cliente toca em "Enviar pelo WhatsApp" e manda o código para o número da casa.
4. A Meta avisa o site (`/api/whatsapp/webhook`). Se a mensagem veio **do mesmo número informado**, a reserva vira **confirmada** e o cliente recebe a resposta automática. Número falso nunca consegue mandar a mensagem.
5. Sem mensagem no prazo, o pedido vira **expirada** e a mesa volta a ficar livre.

No painel `/admin`: cadastro e posição das mesas (arrastar), lista de pedidos por edição, confirmação manual (cliente que não conseguiu enviar) e cancelamento.

### Configurar o WhatsApp Cloud API (uma vez)

Precisa de um número de telefone **só para o sistema** — enquanto estiver na API, ele não funciona no app WhatsApp do celular.

1. [developers.facebook.com](https://developers.facebook.com) → **Criar app** → tipo **Empresa** → adicionar o produto **WhatsApp**, ligado ao portfólio (Meta Business) da GIBSON PROMOÇÕES.
2. **WhatsApp → Configuração da API** → adicionar o número de telefone e verificar por SMS. Copiar o **ID do número de telefone** → `WHATSAPP_PHONE_NUMBER_ID`; o número com 55 → `WHATSAPP_NUMERO_CASA`.
3. **Token permanente:** business.facebook.com → Configurações → **Usuários do sistema** → criar (admin) → **Gerar token** com as permissões `whatsapp_business_messaging` e `whatsapp_business_management` → `WHATSAPP_TOKEN`.
4. **Chave secreta do app:** no app → Configurações → Básico → **Chave secreta do aplicativo** → `WHATSAPP_APP_SECRET`.
5. Inventar um texto qualquer → `WHATSAPP_VERIFY_TOKEN`. Cadastrar as variáveis na Vercel e publicar.
6. **WhatsApp → Configuração → Webhook:** URL `https://<domínio do site>/api/whatsapp/webhook`, token de verificação = o mesmo texto do passo 5 → **Verificar e salvar** → em campos do webhook, assinar **messages**.
7. Publicar o app (modo **Ativo**) e fazer uma reserva de teste do celular.

Custo: mensagens que o cliente manda e as respostas dentro de 24h são gratuitas na Meta.

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
