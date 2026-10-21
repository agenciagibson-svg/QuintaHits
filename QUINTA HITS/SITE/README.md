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

## Várias casas: Harley Grill (`/harley-grill`)

O mesmo sistema de reservas atende outras casas, cada uma com as **próprias mesas, edições, regras e planta**. A Quinta Hits
(Florindos Bar) segue exatamente como antes: o site, a programação, o app da casa (`/casa`) e o WhatsApp são só dela.

- **Página de reserva:** `/harley-grill` (também abre pelo domínio próprio, ver abaixo). Mostra só edições do Harley
  completas, liberadas para o site e dentro do prazo. O pedido é sempre no **modo formulário**: nasce *aguardando*, com
  código `HG-000000`, segura a mesa até o fim do dia e a equipe confirma ou recusa no painel (botão do WhatsApp com a
  mensagem pronta). Abre e fecha com a mesma chave `RESERVAS_SITE_ENABLED`; não depende do WhatsApp.
- **Painel `/admin`:** seletor **Casa** no menu lateral. Programação, Reservas, Regras da noite e Mesas passam a ser da casa
  escolhida. O contador de pedidos mostra a casa de cada pedido. Atendimento e Dados da casa são só da Quinta Hits.
- **Edições do Harley:** qualquer dia da semana. O id é `AAAA-MM-DD_harley-grill` (a Quinta Hits continua `AAAA-MM-DD`).
  Para abrir: preencher horário em Programação e as regras + "Liberar esta edição para reservas pelo SITE" em Regras da noite.
- **Mapa:** redesenhado a partir da planta da casa, só com o que importa a quem reserva: entrada, palco (onde ficava a
  logo), Bar Entrada, Deck com o telão, Bar, Kids, Bar Drinks, banheiros e as paredes que dividem os setores, como na
  planta; as 93 mesas por cima e a Pista VIP em
  azul. Mesas (número, lugares, área, posição) e setores (arrastar e redimensionar) se ajustam em **Mesas** com a casa
  Harley escolhida.
- **Domínio próprio:** na Vercel, adicione o domínio ao projeto e a variável
  `DOMINIOS_CASAS="reservas.harleygrill.com.br=harley-grill"` (vários: separados por vírgula). Nesse domínio, `/`,
  `/reservar` e `/programacao` levam a `/harley-grill`.
- **No site da Quinta Hits:** a seção "Onde" da home mostra o Harley Grill abaixo do Florindos Bar (endereço, mapa e
  "Reservar mesa" → `/harley-grill`), e a home e a `/programacao` ganham a agenda do Harley, separada das quintas
  (só aparece quando há evento futuro). Endereço, cidade, "quando" e Instagram: painel → **Casa**, com o Harley escolhido.
- **Configuração da casa** (nome, código, planta, tamanho das mesas): `src/config/casas.ts`.

### Ativar (uma vez, nesta ordem)

1. Supabase → SQL Editor: rodar `supabase/migracao-2026-10-20-multi-casa.sql` (não muda nada do que já existe; o site
   atual continua funcionando com ela).
2. Supabase → SQL Editor: rodar `supabase/migracao-2026-10-21-dados-das-casas.sql` (endereço do Harley).
3. Publicar o site novo na Vercel.
4. Supabase → SQL Editor: rodar `supabase/seed-2026-10-20-harley-grill-mesas.sql` (as 93 mesas e o mapa do Harley). **Só depois
   do passo 3**: o site antigo não separa as casas e mostraria essas mesas no mapa da Quinta Hits.

Reversão: `supabase/reverter-2026-10-20-multi-casa.sql` (apaga os dados do Harley; os da Quinta Hits ficam).

## Dinâmico

- `/` e `/programacao` são regeneradas a cada 60 s (a próxima quinta e a contagem mudam sozinhas).
- A contagem regressiva aponta para a próxima EDIÇÃO real, pulando quintas canceladas.
- Faixa "Hoje é quinta. Tem Quinta Hits." aparece só nas quintas que têm edição (fuso de Uberlândia).
- `GET /api/proxima` — próxima edição, contagem em segundos, link de reserva.
- `GET /api/programacao?limite=6` — próximas e anteriores em JSON.
- `/opengraph-image` — imagem de compartilhamento gerada com a próxima edição.

## Regras de marca que o código respeita

- Nome da empresa no site: **HITS PRODUÇÕES** (desde 07/10/2026; antes GIBSON PROMOÇÕES).
- Paleta: `#17352B` `#F1E7D2` `#B84A32` `#D5A62A` `#171717`.
- Placa com canto reto embaixo à direita; aba de edição pendurada nesse canto.
- Comunicação institucional não depende do artista da semana.
