# Agente de reservas QUINTA HITS — WhatsApp Cloud API

> Documento mestre. Atualizado a cada etapa. **Nunca** colocar aqui tokens, PINs, segredos ou dados
> pessoais de clientes. Os identificadores da Meta abaixo (IDs) não são segredos.
>
> **Situação (21/09/2026): FASE 0 — auditoria e plano concluídos e APROVADOS pelo responsável. Nada foi
> implementado, registrado na Meta, enviado ou executado em banco.** Cada mudança de fase depende de
> autorização (seções 16 e 17). Decisões aprovadas em 21/09/2026 estão na seção 17.

## 1. Objetivo

Atendimento de reservas de mesa da QUINTA HITS pelo WhatsApp oficial (Cloud API da Meta): o cliente
conversa, o agente consulta a disponibilidade **real** no banco, coleta os dados, confirma e grava a
reserva; quando não puder resolver, passa para uma pessoa. Sem Evolution API, sem BSP, sem automação
não oficial.

Regras de marca que valem para todo texto do agente (`CLAUDE.md` é a fonte de verdade):

- Empresa: **GIBSON PROMOÇÕES** (nunca "Produções"). O prompt original escreve "Gibson Promoções"; vale a grafia do `CLAUDE.md`.
- Casa: **Florindos Bar, Uberlândia/MG**. **Nunca citar o Tatu Bola** (DEC-009). Edições antigas no banco ainda têm `local = 'Tatu Bola'`; o agente só lê edições futuras, e há trava explícita no código (seção 8).
- Não inventar dado: horário, preço, consumação, tolerância e capacidade vazios = o agente diz que não tem a informação e passa para humano.
- Assinatura publicitária: "Se é quinta, tem Hits."

## 2. Identificadores oficiais

| Item | Valor |
|---|---|
| Número | +55 34 99116-7064 |
| Phone Number ID | 1352142871312651 |
| WABA ID | 2225871044650782 |
| Meta Business ID | 729986122385000 |
| App Meta | Gibson Atendimento (App ID 1618887669882753) |
| Nome de exibição | "QuintaHits", em análise pela Meta — **não alterar nem reenviar** durante a análise |
| Outro número da GIBSON PROMOÇÕES | fora do escopo. Não registrar, não alterar, não responder |

## 3. Arquitetura encontrada (auditoria de 21/09/2026)

| Aspecto | Encontrado |
|---|---|
| Framework | Next.js 15.5.25 (App Router), React 19.1.1, TypeScript 5.8 |
| Hospedagem | Vercel, time `agenciagibson-1820`, projeto `quinta-hits`. Deploy pela CLI, **sem** Git conectado. Domínio atual: `quinta-hits-eight.vercel.app` |
| Backend | Rotas de API do próprio Next (Node). Sem servidor separado |
| Banco | Supabase (Postgres). Acesso só pelo servidor, com service_role. RLS ligado e **sem policies** |
| Migrações | SQL manual em `SITE/supabase/`, rodado no SQL Editor. Convenção `migracao-AAAA-MM-DD-nome.sql`. Sem CLI de migração |
| Autenticação | Painel `/admin`: Supabase Auth (e-mail e senha) + lista `ADMIN_EMAILS` + cookie de sessão assinado por HMAC (`ADMIN_SESSION_SECRET`). Duas camadas: middleware e `exigirSessao()` em cada rota |
| Painel | `/admin`: `AdminDashboard` (agenda e config), `MesasEditor` (mapa), `ReservasPainel` |
| Dependências | Só `next`, `react`, `react-dom`, `@supabase/supabase-js`, `server-only`. **Sem** SDK de IA, fila, ORM, biblioteca de teste, rate limiting ou logger |
| Testes | **Nenhum** arquivo de teste no projeto |
| Logs | `console.error` simples |
| Tarefas agendadas | Nenhuma. A expiração de pedidos é "preguiçosa" (roda antes de cada leitura/gravação de reservas) |
| IA | Nenhuma integração |
| Webhook/WhatsApp | Existe (ver 3.1) |
| CRM, clientes, mensagens, filas | Não existem |

Variáveis já no código (`.env.example`): `WHATSAPP_NUMERO_CASA`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN`,
`WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`. **Nenhuma** está cadastrada na Vercel hoje: a reserva pelo site
responde 503 de propósito.

### 3.1 O que já existe de WhatsApp

Fluxo atual, **site primeiro**: o cliente escolhe a mesa em `/reservar` (Turnstile), o pedido nasce
`aguardando` com código `QH-NNNNNN` e segura a mesa por 15 min; o cliente manda o código pelo WhatsApp; o webhook
confirma **se o remetente é o mesmo número informado**.

- `src/app/api/whatsapp/webhook/route.ts` — GET (verificação) e POST (mensagens).
- `src/lib/whatsapp.ts` — `assinaturaValida` (HMAC-SHA256, tempo constante, **recusa tudo sem o App Secret**), `enviarTexto`, `mensagensDoWebhook`.
- `src/lib/reserva.ts` — `normalizarWhatsapp`, `mesmoWhatsapp` (trata o 9 extra do celular brasileiro), limites (`MAX_RESERVAS_POR_WHATSAPP = 2`, `PRAZO_CONFIRMACAO_MIN = 15`).
- `src/lib/reservas.ts` — `edicoesReservaveis`, `edicaoReservavel`, `mapaDaEdicao`, `expirarPedidosVencidos`.
- Banco: `edicoes`, `mesas` (x/y no mapa, `area`, `lugares`, `ativa`), `reservas` (status `aguardando|confirmada|expirada|cancelada`; **índice único parcial `(edicao_id, mesa_id)` para aguardando/confirmada** = o banco impede reserva dupla).
- Painel: cadastro e arraste de mesas; lista de reservas com confirmar à mão e cancelar.

## 4. O que será reaproveitado, o que falta e o que muda

**Reaproveitar sem mudar:** verificação de assinatura, normalização e comparação de telefone, tabelas `edicoes`/`mesas`/`reservas`
e o índice anti-duplicidade, autenticação e padrão visual do painel, `edicoesReservaveis`/`mapaDaEdicao`.

**Lacunas (não existem):** contatos, conversas, mensagens, auditoria, atendimento humano, máquina de estados, fila de envio com
retentativa, idempotência por mensagem, limitação de taxa, regras configuráveis (prazos, tolerância, consumação, textos),
templates, painel de conversas, rota de registro do número, página de privacidade, testes, retenção/expurgo de dados.

**Mudanças no que existe (todas aditivas e compatíveis):**

1. Webhook: hoje **não filtra por `phone_number_id`** (processaria qualquer número do app), **ignora atualizações de status** e responde só depois de processar. Passará a filtrar, deduplicar por `wamid`, tratar status e processar depois de responder à Meta.
2. `whatsapp.ts` tem a versão da Graph API fixa (`v21.0`): passa a vir de `META_GRAPH_API_VERSION`.
3. `reservas` ganha colunas aditivas: `origem_reserva` (`site|whatsapp_agent|admin|manual`, padrão `site`), `contato_id`, `observacoes`, `atendente`. Isso também fecha a lacuna do `CLAUDE.md` (reserva sem canal registrado). Os dois fluxos coexistem: o do site (código `QH-NNNNNN`) não muda.
4. Enquanto `WHATSAPP_AGENT_ENABLED=false`, o webhook se comporta **exatamente como hoje** (confirmação por código). É o caminho de rollback.

## 5. Decisões de arquitetura propostas

| Tema | Proposta | Motivo |
|---|---|---|
| Nomes de variáveis | **Manter `WHATSAPP_*`** e acrescentar o que falta (seção 9). Tabela de equivalência com os nomes do prompt | Já estão no código, README e `.env.example`; renomear só cria risco |
| IA | **Fase 1 sem IA**: máquina de estados determinística (menus numerados, palavras-chave, regex). IA opcional numa fase posterior, atrás de flag | Projeto não tem IA; sem custo, sem prompt injection, comportamento previsível. O prompt manda usar IA "se já existir" |
| Fila de envio | Tabela `wa_fila_saida` (outbox) no Postgres, processada logo após a resposta ao webhook (`after()` do Next) e por reprocessamento agendado | Sem dependência nova. Redis/QStash só se o volume exigir |
| Limite de taxa | Contadores no Postgres por contato e janela | Sem Redis no projeto |
| Chaves liga/desliga | Duas camadas: variável de ambiente (mestre, exige redeploy) **e** `wa_config` (botões do painel, sem redeploy). Vale o mais restritivo | Pausa de emergência precisa ser instantânea |
| Homologação | **Segundo projeto Supabase, separado da produção** (decidido em 21/09), com seed fictício e lista de números de teste. Substitui a proposta original de "homologar em produção" | Nenhum dado real no ambiente de teste; a proteção de login dos previews da Vercel impede a Meta de alcançar a URL, então a homologação com a Meta precisa de um deploy próprio ou de túnel (seção 24) |
| Testes | `vitest` como devDependency (projeto não tem nenhum) | Única dependência nova, só de desenvolvimento |
| Migrações | Aditivas, idempotentes, com `reverter-*.sql` que remove **apenas** o que foi criado | Sem CLI de migração; nada destrutivo |

## 6. Fluxo de atendimento (alvo)

1. Mensagem chega → cria/atualiza contato (telefone vem da API; **não perguntar de novo**).
2. Saudação: "atendimento de reservas da QUINTA HITS" (sem prometer o que não estiver cadastrado).
3. Escolhe a edição (`edicoesReservaveis`: futuras, `confirmada`/`a_confirmar`). Nenhuma edição = humano.
4. Pergunta quantas pessoas (1–50; máximo configurável).
5. Consulta mesas livres com capacidade suficiente (`mapaDaEdicao`). **Sem mesas cadastradas ou regras vazias = humano, sem confirmar nada.**
6. Oferece só o que está livre; coleta nome da reserva e observações essenciais.
7. Mostra resumo e pede "confirmar".
8. Grava a reserva (índice único do banco decide disputa) e **só depois** envia a confirmação com o código `QH-NNNNNN`.
9. Alteração e cancelamento pelo mesmo canal, respeitando o prazo configurado. Fora da regra = humano.

Como o cliente já está conversando pelo número verificado pela Meta, a reserva feita pelo agente nasce `confirmada`
(sem a etapa do código do fluxo do site). Limite de 2 reservas por WhatsApp por edição continua valendo.

## 7. Estados da conversa

`NEW → WELCOME → SELECTING_EVENT → ASKING_GUEST_COUNT → CHECKING_AVAILABILITY → SELECTING_TABLE → COLLECTING_NAME → COLLECTING_NOTES → REVIEWING_RESERVATION → CONFIRMED`

Laterais: `ALTERING_RESERVATION`, `CANCELLING_RESERVATION`, `WAITING_HUMAN`, `CLOSED`.

- O estado e o contexto (edição, pessoas, mesa, nome, observações) ficam na conversa; retomada após interrupção.
- Estado parado por mais de 24 h volta a `WELCOME` (expiração segura).
- Duas mensagens seguidas não compreendidas → `WAITING_HUMAN`.
- Toda transição é uma função pura e testável; nenhuma transição altera reserva sem passar pela camada de reservas validada.

## 8. Estrutura do banco (proposta inicial — **superada pela seção 21**, que traz a versão final e o SQL)

Prefixo `wa_` nas tabelas novas para não confundir com as do site. Todas com RLS ligado, sem policies (mesmo modelo de hoje).

| Tabela | Conteúdo |
|---|---|
| `wa_contatos` | `wa_id` único, telefone normalizado, nome, origem e data do consentimento, primeiro/último contato, observações, bloqueado, preferência |
| `wa_conversas` | contato, estado, contexto (jsonb, sem segredos), status (`aberta`/`aguardando_humano`/`com_humano`/`encerrada`), atendente, motivo do repasse, contador de "não entendi", último movimento, fim da janela de 24 h, aberta/encerrada em |
| `wa_mensagens` | `wamid` **único** (idempotência), conversa, direção, tipo, conteúdo (com data de expurgo), status (`recebida/na_fila/enviada/entregue/lida/falhou`), erro sanitizado |
| `wa_fila_saida` | destino, tipo (texto/template), payload, tentativas, próxima tentativa, status (incluindo `morta` = dead-letter), chave de idempotência única |
| `wa_webhook_eventos` | id único do evento (deduplicação de mensagens e de status) |
| `wa_config` | linha única: agente ativo, envio ativo, repasse humano ativo, pausa de emergência, números de teste, textos, e **regras**: prazo de confirmação, máx. de pessoas, tolerância, consumação (texto), prazo de cancelamento, pagamento (`false`) |
| `reservas_historico` | reserva, status anterior e novo, ator, data |
| `auditoria` | ator, ação, entidade, detalhe sanitizado, data |
| `reservas` (existente) | + `canal`, `contato_id`, `observacoes`, `atendente` (colunas novas, opcionais) |
| `edicoes_regras` (opcional) | capacidade total e regras por edição, só se o responsável fornecer |

Eventos = `edicoes` existente. Mesas/setores = `mesas` existente (`area` é o setor). Não serão criadas tabelas duplicadas.

## 9. Variáveis de ambiente

Nomes que o prompt sugere → nome no projeto:

| Prompt | Projeto | Situação |
|---|---|---|
| `META_GRAPH_API_VERSION` | `META_GRAPH_API_VERSION` | **novo** (hoje fixo `v21.0` no código) |
| `META_APP_ID` | `META_APP_ID` | novo, só para conferir o token |
| `META_APP_SECRET` | `WHATSAPP_APP_SECRET` | existente |
| `META_WABA_ID` | `WHATSAPP_WABA_ID` | novo |
| `META_PHONE_NUMBER_ID` | `WHATSAPP_PHONE_NUMBER_ID` | existente |
| `META_ACCESS_TOKEN` | `WHATSAPP_TOKEN` | existente |
| `META_WEBHOOK_VERIFY_TOKEN` | `WHATSAPP_VERIFY_TOKEN` | existente |
| — | `WHATSAPP_NUMERO_CASA` | existente (dígitos com 55) |
| `META_APP_SECRET_PROOF_ENABLED` | `META_APP_SECRET_PROOF_ENABLED` | novo |
| `WHATSAPP_AGENT_ENABLED` | idem | novo, padrão `false` |
| `WHATSAPP_SEND_ENABLED` | idem | novo, padrão `false` |
| `WHATSAPP_HUMAN_HANDOFF_ENABLED` | idem | novo, padrão `true` |
| `WHATSAPP_REGISTRATION_PIN` | **não vira variável da Vercel** | ver seção 11 |

Regras: `.env.example` só com nomes; nada com `NEXT_PUBLIC_` além do já existente; validação na inicialização (falta uma
obrigatória = agente desligado e log sem valores); token e segredos só no servidor; cadastro na Vercel pelo painel ou CLI
sem imprimir o valor.

## 10. Rotas e serviços (planejado)

| Item | Função |
|---|---|
| `GET /api/whatsapp/webhook` | verificação da Meta (`hub.challenge`) — existe |
| `POST /api/whatsapp/webhook` | valida `X-Hub-Signature-256`, filtra `phone_number_id = 1352142871312651`, deduplica, grava, responde 200 rápido e processa depois — **alterar** |
| serviço de envio | Graph API com versão por variável, `appsecret_proof` opcional, tratamento de 429/5xx com espera crescente |
| processador da fila | envia, reprocessa, move para `morta` após o limite |
| máquina de estados | `src/lib/agente/` — puro, sem acesso a rede |
| camada de reservas | criar/alterar/cancelar com validação; única porta de escrita |
| `/api/admin/whatsapp/*` | conversas, repasse, pausa, indicadores (sob `exigirSessao()`) |
| script local de registro | ver seção 11 |

## 11. Registro do número na Cloud API (**não executado**)

Situação informada: número validado por ligação, mas a Meta responde *"A conta não existe na API de Nuvem. Use /register API
para criar uma conta primeiro."* Chamada oficial:

```
POST https://graph.facebook.com/{META_GRAPH_API_VERSION}/1352142871312651/register
Authorization: Bearer <token>
{ "messaging_product": "whatsapp", "pin": "<6 dígitos>" }
```

Desenho, para cumprir as regras do prompt:

- Um **script local** (`scripts/whatsapp-registrar.mjs`), nunca rota HTTP do site. O PIN é digitado no terminal com entrada oculta; **não é gravado** em arquivo, banco, log, histórico nem variável da Vercel (desvio consciente da lista do prompt, que sugere `WHATSAPP_REGISTRATION_PIN`: guardar PIN em ambiente é pior do que pedir na hora).
- **Antes** do registro, verificação **somente leitura** (`GET`): o token pertence ao App 1618887669882753 (`/debug_token`), enxerga a WABA 2225871044650782 e o Phone Number ID 1352142871312651 (`/{waba}/phone_numbers`), e tem `whatsapp_business_messaging`. Qualquer divergência → o script para.
- Saída: apenas status HTTP e resposta com campos sanitizados. Token e PIN nunca são impressos.
- Número já registrado: resposta tratada como sucesso idempotente, sem repetir a chamada.
- Não toca em nenhum outro número. Não tenta contornar verificações da Meta.
- Depois do sucesso: conferir o status no Gerenciador do WhatsApp (qualidade, verificação, nome de exibição em análise).

**Riscos a confirmar antes:** (a) número registrado na Cloud API **deixa de funcionar no app WhatsApp/WhatsApp Business do celular** — confirmar que ninguém precisa dele lá; (b) o PIN de 6 dígitos é escolhido pelo responsável (ou é o PIN já existente, se o número tiver verificação em duas etapas).

## 12. Webhook na Meta (**não configurado**)

- URL: `https://<domínio>/api/whatsapp/webhook`. **Publicada e respondendo antes** de salvar na Meta.
- Token de verificação = `WHATSAPP_VERIFY_TOKEN` (texto inventado pelo responsável).
- Campos assinados: `messages` (mensagens **e** status de entrega/leitura/falha). Templates só quando o primeiro for criado.
- **Modelo adotado (decisão de 21/09/2026):** **um único callback por aplicativo**, o aplicativo inscrito na WABA e os eventos de **todos** os números vinculados chegando ao **mesmo** callback. A separação é obrigatória **no backend, pelo `phone_number_id`** (seção 23). Configuração de URL independente por número **não** é tratada como solução provável; só entra se houver evidência explícita no painel, documentada com captura e localização exata, e mesmo assim sem executar alteração.
- **Risco de colisão:** salvar uma URL no app "Gibson Atendimento" muda o destino dos eventos do outro número (final 0200). **Nenhuma URL é salva ou substituída** até conhecermos o destino atual do 0200 (checklist da seção 22).
- App em modo **Desenvolvimento**: só recebe de/para números de teste (até 5). Passar para **Ao vivo** exige política de privacidade e é decisão do responsável (seção 17).

## 13. Janela de 24 h e templates

Dentro de 24 h da última mensagem do cliente: texto livre. Fora: só template aprovado. O sistema guardará `janela_expira_em` e
**recusará** envio livre fora dela. Nada é cadastrado na Meta automaticamente. Sugestões de template (texto para o responsável
submeter, sempre citando o Florindos Bar): confirmação de reserva, lembrete do evento, alteração, cancelamento, retomada de
atendimento. Sem mensagem em massa e sem campanha.

## 14. Segurança e LGPD

- Assinatura do webhook obrigatória (já existe); segredos só no servidor; logs sem token, telefone completo nem conteúdo.
- Idempotência por `wamid`; limite por contato e pausa global de emergência; sanitização de entradas.
- Sem conteúdo de conversa por tempo indefinido: política de retenção configurável e rotina de limpeza (seção 21.7), **pendente de validação administrativa e jurídica**.
- Direito de exclusão/anonimização por solicitação (rotina documentada).
- **Lacuna:** não existe página de política de privacidade (a Meta exige para colocar o app "Ao vivo"). O texto é jurídico e precisa de aprovação do responsável; será entregue como rascunho, sem inventar promessas.
- Backup: o do Supabase; plano de recuperação a documentar na fase de deploy.

## 15. Testes

**Realizados até agora (auditoria):** `tsc --noEmit` e `next build` sem erro; produção respondendo (home, programação, reservar, APIs, admin com 401/redirect); webhook recusando sem assinatura. **Nenhum teste automatizado de WhatsApp existe ainda.**

**A criar (vitest):** verificação GET; assinatura válida/inválida/ausente; payload duplicado; texto, tipo desconhecido, status; roteamento por Phone Number ID (número diferente ignorado); reserva livre/indisponível; corrida pela última mesa; alteração; cancelamento; repasse humano; falha e 429 da Meta com retentativa; token ausente; janela de 24 h; ausência de dados pessoais nos logs; trava "Tatu Bola" nunca aparece em texto do agente.

## 16. Plano por etapas (ordem do prompt) e portões de autorização

| # | Etapa | Portão |
|---|---|---|
| 1–2 | Auditoria e este documento | **feito — aguarda aprovação do diagnóstico e das decisões (17)** |
| 3–4 | Modelagem e migrações aditivas com reversão | ⏸ autorizar antes de rodar SQL no banco |
| 5–7 | Webhook GET/POST, assinatura, persistência e idempotência | — (código; flags desligadas) |
| 8 | Serviço de envio (com `WHATSAPP_SEND_ENABLED=false`) | — |
| 9 | **Registro do número (`/register`)** | ⏸ autorização explícita + PIN digitado pelo responsável |
| 10–12 | Estados, reservas, atendimento humano | — |
| 13 | Painel de conversas e chaves de pausa | — |
| 14–15 | Fila/retentativas e testes | — |
| 16 | Deploy com flags desligadas | ⏸ passa por `qh-qa-site`, `code-reviewer` e `deploy-checker` |
| 17 | Webhook na Meta | ⏸ autorização |
| 18 | Teste com número controlado (envio ligado só para a lista de teste) | ⏸ autorização |
| 19–20 | Checklist de produção e liberação gradual (app "Ao vivo") | ⏸ autorização |

## 17. Decisões do responsável (21/09/2026) e pendências

**Decididas:**

1. **Número +55 34 99116-7064:** já foi desconectado do app do celular; uso exclusivo da Cloud API e do CRM. O registro (`/register`) só roda com autorização expressa **e** depois de: banco pronto, webhook preparado, testes locais aprovados e variáveis configuradas. PIN pedido no terminal com entrada oculta, sem salvar em lugar nenhum.
2. **Outro número (+55 34 3222-0200, final 0200):** está na mesma conta WhatsApp Business e pode estar no mesmo app "Gibson Atendimento". Não alterar, registrar, remover ou desativar. O endpoint aceita múltiplos números e roteia **obrigatoriamente** por `phone_number_id`; o agente só processa `1352142871312651`. Outro ID: registrar evento sanitizado, responder 200, **sem resposta automática**. Nenhuma URL da Meta é trocada antes de o mapa do webhook atual e o impacto nos dois números serem apresentados e aprovados (seções 22 e 23).
3. **Dois fluxos coexistem** (site com código; conversa direta no WhatsApp). Origem explícita na reserva: `site`, `whatsapp_agent`, `admin`, `manual`. `WHATSAPP_AGENT_ENABLED=false` e `WHATSAPP_SEND_ENABLED=false` durante toda a implementação e homologação.
4. **Fase 1 sem IA:** menus, palavras-chave, botões e listas interativas quando suportados, máquina de estados, respostas padronizadas, repasse humano. Arquitetura preparada para IA futura; nada de IA instalado ou contratado.
5. **Regras de reserva:** nenhuma é definitiva. Tudo configurável no painel **por edição** (lista na seção 21). Edição sem mesas e regras completas → agente não confirma nada, repassa a humano, e o painel mostra que ela não está pronta.
6. **Homologação:** segundo projeto Supabase, separado. Seed fictício, sem dado pessoal real, só contatos autorizados. **Nenhum SQL em produção** sem autorização depois da apresentação.
7. **Atendimento humano na fase 1:** só no painel (fila "Aguardando atendimento humano", destaque e contador). Sem e-mail/WhatsApp para a equipe (arquitetura preparada). Ao transferir, o agente pausa; o atendente assume, vê motivo e histórico e pode devolver ao agente.
8. **Commit:** local, só deste documento, sem push/deploy.

**Decisões adicionais (2ª aprovação, 21/09/2026):**

9. **Webhook:** um único callback por aplicativo; eventos de todos os números no mesmo callback; separação no backend por `phone_number_id`. Configuração por número não é a solução provável (seção 12). Nenhuma URL da Meta é salva ou substituída até se conhecer o destino do número 0200.
10. **Inspeção do CRM da Gibson:** autorizada **somente leitura** (nomes de variáveis, arquitetura). Feita em 21/09/2026; relatório na seção 22.
11. **Mesas e disponibilidade:** **uma única fonte de estoque** (`edicoes`, `mesas`, `reservas` + índice único). Cada mesa pode ser liberada ou não por canal (site, WhatsApp, painel, indisponível) por configuração explícita, sem estoque paralelo. Testes de corrida entre canais obrigatórios (seções 21.3 e 21.6).
12. **Retenção de dados (LGPD):** política inicial configurável (seção 21.7), rotina de limpeza desligada por padrão. **Pendente de validação administrativa e jurídica antes da produção.**
13. **Homologação:** Supabase separado; endpoint público estável e sem login **apenas na rota do webhook**; nada é configurado ainda (seções 24 e 25).
14. **Commits:** em português, seguindo o `CLAUDE.md`. Segundo commit local autorizado, sem push, deploy, merge nem SQL em qualquer Supabase.

**Ainda pendentes:**

- Valores das regras de cada edição (horários, consumação, tolerância etc.), cadastrados por você no painel quando o módulo existir. Nenhum valor provisório será tratado como oficial.
- **Token permanente** da Cloud API (usuário do sistema com `whatsapp_business_messaging` e `whatsapp_business_management`), cadastrado direto na Vercel, fora do chat.
- Criar o **projeto Supabase de homologação** (checklist na seção 24) e a lista de **contatos de teste autorizados** (até 5).
- Auditar no painel da Meta o webhook atual do app (seção 22) — só você enxerga essa tela.
- **Validação administrativa e jurídica** da política de retenção (seção 21.7): os valores iniciais estão definidos, mas nada vai para produção sem essa validação.
- Plano da Vercel do time (define tarefa agendada e tempo máximo de função).
- Aprovação do texto da política de privacidade.

## 18. Plano de rollback

1. Desligar `WHATSAPP_AGENT_ENABLED` e `WHATSAPP_SEND_ENABLED` (painel ou Vercel): o webhook volta ao comportamento atual.
2. Reverter o deploy na Vercel (Instant Rollback) para a versão anterior.
3. Meta: remover a assinatura do webhook; o número continua registrado.
4. Banco: rodar `reverter-*.sql`, que remove **somente** tabelas/colunas criadas por esta entrega. Reservas e dados existentes não são tocados.

## 19. Checklist de produção (a marcar)

- [ ] Diagnóstico aprovado e itens 1–10 da seção 17 respondidos
- [ ] Migrações aplicadas e reversão testada
- [ ] Testes automatizados aprovados
- [ ] Verificação somente leitura do token/WABA/número aprovada
- [ ] Número registrado na Cloud API e status conferido no Gerenciador
- [ ] Webhook publicado, verificado e assinado; assinatura validada com evento real
- [ ] Roteamento por Phone Number ID conferido; outro número não afetado
- [ ] Mensagem de teste recebida e enviada (lista de teste)
- [ ] Reserva gravada sem duplicidade; corrida testada
- [ ] Repasse humano funcionando
- [ ] Segredos fora do código, dos logs e deste documento
- [ ] Política de privacidade publicada; retenção e exclusão documentadas
- [ ] `qh-qa-site`, `code-reviewer` e `deploy-checker` aprovados
- [ ] Rollback ensaiado
- [ ] Responsável recebeu o guia de operação
- [ ] Liberação gradual autorizada

## 20. Histórico de decisões

| Data | Decisão |
|---|---|
| 21/09/2026 | Auditoria feita antes de qualquer código. Nada implementado, registrado ou enviado |
| 21/09/2026 | Manter nomes `WHATSAPP_*` já existentes em vez de renomear para `META_*` |
| 21/09/2026 | Fase 1 sem IA (máquina de estados determinística); IA opcional depois |
| 21/09/2026 | PIN de registro nunca vira variável de ambiente: digitado localmente num script |
| 21/09/2026 | Homologação em produção com flags desligadas e lista de números de teste, por causa da proteção de login dos previews da Vercel |
| 21/09/2026 | Grafia oficial da empresa: GIBSON PROMOÇÕES (`CLAUDE.md`) |
| 21/09/2026 | Diagnóstico aprovado. Homologação passa a ser em **segundo projeto Supabase** (substitui "produção com flags desligadas") |
| 21/09/2026 | Origem da reserva: `site`, `whatsapp_agent`, `admin`, `manual` (coluna `origem_reserva`) |
| 21/09/2026 | Repasse humano só no painel na fase 1; sem disparo externo |
| 21/09/2026 | Sem views e sem funções SQL chamáveis pela API nas migrações: o Supabase as expõe ao navegador. Fila e trava usam compara-e-troca no aplicativo |
| 21/09/2026 | Regras por edição em tabela própria (`edicoes_regras`) sem valores padrão: `NULL` = "não definido", nunca um valor provisório |
| 21/09/2026 | Trava `APP_AMBIENTE` (variável) = `wa_config.ambiente` (banco): se divergirem, o agente fica desligado |
| 21/09/2026 | Roteamento: o endpoint existente é ampliado (sem segunda rota); só o Phone Number ID `1352142871312651` chega ao agente |
| 21/09/2026 | **Corrige a proposta anterior:** URL exclusiva por número deixa de ser a solução recomendada. O modelo é webhook único do app, separação por `phone_number_id` no backend |
| 21/09/2026 | Disponibilidade: estoque único; `edicoes_mesas` passa a guardar **canais** por mesa (`disponivel_site`, `disponivel_whatsapp`, `disponivel_admin`) em vez de "mesa ativa" |
| 21/09/2026 | Retenção: `retencao_mensagens_dias` (nulo) substituído por seis prazos com a política do responsável e `limpeza_ativa = false`; `expurgar_em` removido em favor de `conteudo_removido_em` |
| 21/09/2026 | Testes da migração passam a viver no repositório (`SITE/supabase/testes/`, pacote próprio, sem alterar o `package.json` do site): 101 verificações |
| 21/09/2026 | Homologação com a Meta deve usar um **app de teste separado** com número de teste da Meta, para não tocar no app de produção nem no número 0200 (seção 25) |

## 21. Modelagem final, migrações e rollback (**SQL escrito e testado localmente; NÃO executado em nenhum banco**)

Arquivos (em `SITE/supabase/`):

| Arquivo | Função |
|---|---|
| `migracao-2026-09-21-agente-whatsapp.sql` | cria as estruturas novas (idempotente) |
| `reverter-2026-09-21-agente-whatsapp.sql` | desfaz só o que a migração criou, com trava de segurança |
| `homologacao/seed-ficticio.sql` | dados fictícios; só roda em banco marcado como homologação |
| `homologacao/verificar-homologacao.sql` | verificação somente leitura (51 checagens) para o projeto de homologação |
| `testes/testar-migracao.mjs` + `package.json` | 101 verificações num PostgreSQL em memória; pacote próprio, sem alterar o `package.json` do site |
| `../.env.homologacao.example` | variáveis do ambiente de teste (só nomes) |

### 21.1 Antes de criar, o que já existia (equivalentes verificados)

| Necessidade | Já existe? | Decisão |
|---|---|---|
| Eventos | `edicoes` | reutilizada |
| Mesas/setores | `mesas` (`area` = setor) | reutilizada |
| Reservas e anti-duplicidade | `reservas` + índice único parcial | reutilizada; recebe colunas |
| Login e painel | `/admin` | reutilizado |
| Contatos, conversas, mensagens, transferências, idempotência de evento, fila, tentativas, auditoria, regras por edição | **nada equivalente** (busca no código e no banco) | criar |

### 21.2 As 12 tabelas novas: por que cada uma é necessária

| # | Tabela | Por que é necessária | Sem ela |
|---|---|---|---|
| 1 | `wa_config` | interruptores globais (agente, envio, repasse), **pausa de emergência**, modo teste com lista de números, política de retenção, marca de ambiente. Nasce **desligada**, **restrita a testes** e com lista vazia | a pausa dependeria de redeploy; não haveria como restringir a testes nem configurar retenção sem mexer no código |
| 2 | `edicoes_regras` | regras **por edição** editáveis no painel (abertura, prazo, tolerância, cancelamento, capacidade, consumação, preço, sinal, instruções). `NULL` = "não definido", sem nenhum valor padrão | as regras iriam para o código (proibido inventar) ou para colunas em `edicoes` (alteraria uma tabela existente) |
| 3 | `edicoes_mesas` | **canais** por mesa em cada edição: site, WhatsApp, painel ou indisponível. **Não é estoque** | não haveria como esconder uma mesa do WhatsApp sem desativá-la também no site |
| 4 | `wa_contatos` | identidade do cliente (`wa_id` único), consentimento, bloqueio e anonimização | reserva do agente sem vínculo com quem pediu; sem base para LGPD e exclusão |
| 5 | `wa_conversas` | estado da máquina, contexto (edição, mesa, nome), trava otimista contra duas mensagens simultâneas, janela de 24 h | o agente não teria memória; retomada e expiração impossíveis |
| 6 | `wa_transferencias` | fila "Aguardando atendimento humano": motivo, quem assumiu, devolução ao agente, histórico de cada ocorrência | o painel não teria contador, motivo nem tempo de espera; `wa_conversas.status` sozinho perde o histórico |
| 7 | `wa_mensagens` | histórico que o atendente vê e status de entrega. `wamid` **único** garante idempotência | atendente sem contexto; reenvio da Meta processaria a mensagem duas vezes |
| 8 | `wa_webhook_eventos` | deduplica **eventos** (inclusive status, que não são mensagens) e registra, **sem conteúdo e sem telefone**, o que foi ignorado de outros números | reentrega da Meta duplicaria efeitos; não haveria prova de que o número 0200 foi ignorado |
| 9 | `wa_fila_saida` | fila de envio com retentativa, dead-letter (`morta`) e chave de idempotência | envio perdido ou duplicado em falha; 429 da Meta sem tratamento |
| 10 | `wa_fila_tentativas` | uma linha por tentativa (HTTP, erro sanitizado, duração), com retenção independente da fila | sem diagnóstico de falhas e de limite; o detalhe de erro ficaria misturado à fila |
| 11 | `auditoria` | rastro de ações do agente, do atendente e do sistema, sem segredos | ninguém saberia quem alterou reserva, regra ou configuração |
| 12 | `reservas_historico` | trilha das mudanças de status de cada reserva, gravada por gatilho | só existiria o status atual da reserva |

**Candidatas a enxugar, se preferir menos estruturas:** `wa_fila_tentativas` (poderia virar uma coluna JSON dentro de `wa_fila_saida`, perdendo a retenção separada) e `auditoria` (poderia absorver `reservas_historico`). Mantive separadas por clareza e por retenção; a decisão é sua.

**Acesso:** RLS ligado e **sem policies** (igual às tabelas de hoje) e `revoke` de todas as permissões para `anon` e `authenticated`. Sem views e sem funções expostas. Só a service_role, no servidor, lê e escreve.

### 21.3 Mudanças em tabelas existentes (`reservas`) e impacto

| Mudança | Impacto |
|---|---|
| `origem_reserva` (`site`, `whatsapp_agent`, `admin`, `manual`), padrão `site` | todas as reservas atuais viram `site`. O código de hoje não informa a coluna e continua funcionando |
| `contato_id`, `observacoes`, `atendente` | opcionais |
| gatilho `reservas_historico_trg` | grava o histórico de status de **qualquer** caminho (site, webhook atual, painel) sem mexer no código deles. É o único ponto em que o banco faz uma escrita extra a cada reserva; testado |
| `edicoes`, `mesas`, `site_config` | **não são alteradas** |

Nenhuma consulta atual usa `select *` em `reservas` (todas listam colunas), então colunas novas não afetam o código existente. Adicionar colunas com valor padrão constante não reescreve a tabela; ainda assim, **aplicar longe do horário do evento** (não numa quinta à noite).

**Disponibilidade: uma única fonte de verdade.** O estoque é `mesas` + `reservas` + o índice único parcial `(edicao_id, mesa_id)` para reservas `aguardando`/`confirmada`. Site, WhatsApp e painel consultam **as mesmas tabelas** e disputam **a mesma trava**. `edicoes_mesas` só decide **quem pode oferecer** a mesa:

| Situação da mesa na edição | Site | WhatsApp | Painel |
|---|---|---|---|
| sem linha em `edicoes_mesas` (comportamento de hoje) | oferece | **não** oferece (liberação explícita) | oferece |
| `disponivel_site` / `disponivel_whatsapp` / `disponivel_admin` | por canal | por canal | por canal |
| os três desligados | **indisponível** | | |

Se uma mesa não é oferecida ao WhatsApp mas o site a reserva, ela some da lista do WhatsApp: é o mesmo estoque (testado, seção 9 do apêndice). **Ainda não alterei o site** para respeitar `disponivel_site`; hoje o site continua oferecendo todas as mesas ativas. Alinhar isso é uma alteração de código do fluxo atual e depende de sua autorização.

### 21.4 Regras por edição: onde cada item fica

| Item | Onde |
|---|---|
| Data, local, horário do evento | `edicoes.data`, `edicoes.local`, `edicoes.horario` (já existem) |
| Horário de abertura | `edicoes_regras.abertura` |
| Prazo final para reservar | `edicoes_regras.reservas_ate` |
| Tolerância | `edicoes_regras.tolerancia_min` |
| Prazo para cancelamento | `edicoes_regras.cancelamento_ate_horas` |
| Capacidade máxima | `edicoes_regras.capacidade_maxima` |
| Tipos de mesa, lugares e quantidade | `mesas` (`area`, `lugares`) + `edicoes_mesas` (canais e ajuste opcional de lugares) |
| Consumação mínima, preço, sinal | `consumacao_minima_centavos`, `preco_centavos`, `sinal_centavos` (informativos: pagamento segue desligado) |
| Instruções de chegada | `edicoes_regras.instrucoes_chegada` |
| Status das reservas | `reservas.status` (já existe) + interruptor por edição `atendimento_automatico` |

**Prontidão da edição** é calculada no código (não em view SQL, por segurança) e o painel mostra "faltam: …". Campos obrigatórios propostos para liberar o agente: edição futura e não cancelada; `horario` e `local`; `abertura`, `reservas_ate`, `tolerancia_min`, `cancelamento_ate_horas`, `capacidade_maxima`, `consumacao_minima_centavos` (0 = sem consumação; nulo = indefinido) e `instrucoes_chegada`; pelo menos uma mesa com `disponivel_whatsapp`; e `atendimento_automatico = true`. Falhando qualquer um: sem disponibilidade, sem confirmação, **repasse para humano**, e o painel mostra que a edição **não está pronta para reservas automáticas**. A lista é proposta; nenhum valor foi criado.

### 21.5 Rollback

1. **Interruptores:** desligar `WHATSAPP_AGENT_ENABLED`/`WHATSAPP_SEND_ENABLED` ou usar a pausa de emergência do painel: volta ao fluxo atual sem mexer no banco.
2. **Banco:** `reverter-2026-09-21-agente-whatsapp.sql` remove o gatilho, a função, as 4 colunas e as 12 tabelas novas, nessa ordem. **Recusa rodar** se existir reserva com origem diferente de `site`; para homologação, apague as reservas de teste antes. Não toca em `edicoes`, `mesas`, `site_config` nem nos dados de `reservas`.
3. **Perde-se** o conteúdo das tabelas novas: exporte antes de reverter em banco com uso real.

### 21.6 Testes da migração (21/09/2026)

**101 verificações, 0 falhas**, num PostgreSQL 17 em memória (PGlite). Rodar: `cd SITE/supabase/testes && npm install && npm test`. A primeira rodada tinha 75; o conjunto cresceu para 101 com as correções do responsável (canais, corrida entre canais, retenção, script de verificação). O resultado item a item está no **Apêndice A**.

| Grupo | Verificações | O que garante |
|---|---|---|
| 1. Base | 1 | ponto de partida: reserva do fluxo atual gravada |
| 2. Migração | 18 | 12 tabelas criadas; idempotente (3 execuções); reserva antiga preservada e marcada `site`; `wa_config` nasce desligada; política de retenção com os valores do responsável; limpeza desligada |
| 3. Fluxo atual `QH-NNNNNN` | 7 | mesa e código repetidos continuam barrados; busca do webhook pelo código; confirmação sem duplicar; expiração e reconfirmação (23505 se a mesa foi pega) |
| 4. Corrida entre canais | 8 | site × WhatsApp × painel × manual na mesma mesa: só o primeiro vale; corrida de 12 tentativas: 1 aceita e 11 recusadas; cancelamento devolve a mesa a qualquer canal |
| 5. Conversas e idempotência | 13 | uma conversa aberta por contato; uma transferência aberta por conversa; `wamid`, evento e chave de envio únicos; destino de evento restrito |
| 6. Canais por mesa | 4 | padrão (site e painel sim, WhatsApp não); "indisponível"; tabela sem estoque |
| 7. Segurança | 15 | RLS nas 12 tabelas; sem permissão para `anon`/`authenticated`; sem policy; sem view |
| 8. Seed | 6 | travas (recusa em `producao` e com reserva real); idempotente; 5 mesas no WhatsApp e 6 no site |
| 9. Estoque único | 4 | reserva do site some da lista do WhatsApp; WhatsApp barrado pelo banco; mesa fora do WhatsApp reservada pelo painel |
| 10. Verificação | 3 | 51 checagens aprovam; reprovam se `anon` ganhar acesso ou se o envio for ligado |
| 11. Reversão | 22 | recusa com reserva do agente; remove tudo o que criou; preserva tabelas e índice originais; reaplica limpo |

**Limites, ditos com clareza:** (1) o PGlite atende **uma conexão por vez**, então a "corrida" é enfileirada por ele: prova o que o **banco decide** (o índice único), não paralelismo real de conexões. A corrida com conexões paralelas é teste **obrigatório no projeto de homologação**. (2) PGlite **não é o Supabase real** (não exercita PostgREST, papéis e extensões do Supabase): a aplicação e a verificação no projeto de homologação continuam obrigatórias. (3) O teste do **código** (endpoint, máquina de estados, rotina de limpeza) ainda não existe, pois esse código ainda não foi escrito.

### 21.7 Política de retenção de dados (LGPD)

Valores iniciais definidos pelo responsável, **configuráveis** em `wa_config`. **PENDENTE de validação administrativa e jurídica antes da produção** (`politica_retencao_validada_em` fica nulo até lá).

| Dado | Prazo inicial | O que acontece | Coluna de configuração |
|---|---|---|---|
| Conteúdo integral das mensagens (e o `payload` da fila de envio, que também contém texto) | 90 dias | texto apagado; a linha fica só com metadados | `retencao_conteudo_mensagens_dias` |
| Metadados técnicos e status de entrega | 12 meses | linha apagada | `retencao_metadados_meses` |
| Logs de erro (`erro_detalhe`) | 90 dias | detalhe zerado; o código do erro fica com os metadados | `retencao_logs_erro_dias` |
| Eventos de webhook (idempotência) | 30 dias | linha apagada | `retencao_eventos_webhook_dias` |
| Conversas encerradas | 12 meses | anonimiza: nome, telefone e observações do contato apagados, `wa_id` vira `anon-…`, contexto da conversa zerado | `anonimizar_conversas_encerradas_meses` |
| Reservas | 24 meses | anonimiza nome e WhatsApp; mantém edição, mesa, pessoas e status para estatística. Exceção: obrigação legal ou solicitação válida de exclusão (a definir com o jurídico) | `retencao_reservas_meses` |
| Tokens, PINs e segredos | **nunca** | não existem nessas tabelas | — |

**Rotina de limpeza — requisitos (ainda NÃO escrita; o banco já tem os campos):**

- **Desligada por padrão** (`limpeza_ativa = false`) e desativada em desenvolvimento.
- **Execução simulada** (`dry-run`): só conta o que seria afetado.
- Registra **apenas quantidades** em `auditoria`; **nunca** o conteúdo apagado.
- **Respeita reservas abertas:** não anonimiza contato, conversa ou reserva ligados a reserva `aguardando`/`confirmada` de edição de hoje ou futura.
- Em produção só roda com `politica_retencao_validada_em` preenchido.
- Terá testes automatizados e será documentada quando escrita.
- Pedido de exclusão de um titular é um caminho **separado** (anonimização imediata), a especificar.

## 22. Webhook atual: código, inspeção do CRM e checklist da Meta

### 22.1 Mapa do webhook atual (lado do código — auditado em 21/09/2026)

| Pergunta | Resposta | Onde |
|---|---|---|
| Rotas relacionadas ao WhatsApp | Uma só rota de webhook: `/api/whatsapp/webhook` (GET e POST). Indiretas: `POST /api/reservas` (gera o link `wa.me` com o código), `GET /api/reservas/[id]` (status), telas `ReservaMesa` e `ConfirmacaoWhatsapp` | `src/app/api/whatsapp/`, `src/app/api/reservas/`, `src/components/` |
| Verificação GET | compara `hub.verify_token` com `WHATSAPP_VERIFY_TOKEN`; sem a variável, 403 | `webhook/route.ts:13-20` |
| Assinatura | HMAC-SHA256 do corpo bruto com `WHATSAPP_APP_SECRET`, comparação em tempo constante; **sem o segredo, recusa tudo** | `src/lib/whatsapp.ts:26-36` |
| Tratamento do código atual | procura `QH-NNNNNN` (`CODIGO_RE`), busca a reserva mais recente com o código, confere `mesmoWhatsapp`, confirma só de `aguardando`/`expirada` no prazo e responde. Sem código: resposta padrão "Este WhatsApp confirma reservas…" | `webhook/route.ts:47-124`, `src/lib/reserva.ts` |
| Números e Phone Number IDs no código | **nenhum fixo**; só variáveis: `WHATSAPP_NUMERO_CASA` e `WHATSAPP_PHONE_NUMBER_ID` (este só para **enviar**). O webhook **ignora** `metadata.phone_number_id` das mensagens que recebe | `whatsapp.ts:39-52, 58-74` |
| Proteção do middleware | a rota não está no `matcher`: é pública, como a Meta exige | `src/middleware.ts` |
| URL esperada hoje | `https://quinta-hits-eight.vercel.app/api/whatsapp/webhook` (sem domínio próprio) | — |
| Dependências de produção | na Vercel **não há nenhuma variável `WHATSAPP_*`**. Testado em 21/09: GET com token errado → 403; POST sem assinatura e com assinatura falsa → 401. Pelo código, `POST /api/reservas` responde 503 quando o "não sou robô" passa e `WHATSAPP_*` está incompleto (não testado ao vivo). **Conclusão: a Meta não consegue ter verificado este endpoint, então nenhum evento da Meta chega aqui hoje** | Vercel env / testes |

**Riscos do código atual que a ampliação corrige:** (1) responde a **qualquer número** do app, inclusive o final 0200, se algum dia os eventos dele chegarem aqui; (2) ignora atualizações de status; (3) processa antes de responder à Meta; (4) `enviarTexto` envia sempre que há token, sem respeitar `WHATSAPP_SEND_ENABLED`; (5) não deduplica por `wamid` (só o status da reserva protege).

### 22.2 Relatório da inspeção do CRM da Gibson (somente leitura — 21/09/2026)

**Escopo autorizado e respeitado:** só nomes de variáveis, arquitetura e identificadores técnicos. **Não** exibi nem copiei valores ou tokens, **não** modifiquei nada, **não** chamei o site do CRM nem a API da Meta, **não** acessei conversas ou dados pessoais, **não** alterei webhook, registrei número ou fiz deploy. Comandos usados, todos de leitura na API da Vercel do time `agenciagibson-1820`: `project inspect`, `env ls` (a listagem já vem sem valores), `inspect` do deploy de produção e `domains ls` (lista de domínios da conta, sem utilidade aqui). Uma chamada `vercel api` ao projeto não retornou dados.

| Item | Resultado |
|---|---|
| Projeto | `crm.gibsonpromocoes.com.br` (`prj_wk977AT59pQADpcOCnE7mkfcq8OK`), criado em 31/07/2026, Node 24.x |
| Configuração | Framework Preset **"Other"**, Root Directory `.`, saída `public` ou `.` |
| Variáveis de ambiente | **nenhuma**, em nenhum ambiente (a listagem voltou vazia). Nenhum token da Meta, verify token, app secret ou chave de servidor está configurado neste projeto |
| Deploy de produção | `dpl_49U9myyUykcD4Fmo66e9SL25btcx`, de 14/09/2026, status Ready |
| Aliases | `crm.gibsonpromocoes.com.br`, `gibsongestaoartista-tcc2.vercel.app`, `crmgibsonpromocoescombr-agenciagibson-1820.vercel.app` |
| Build | um único item (`.`), **sem nenhuma função serverless** listada |

**Conclusão:** o CRM hospedado na Vercel é um **site estático**, sem backend, sem endpoint HTTP no servidor e sem credenciais da Meta. **Ele não pode estar recebendo webhooks da Meta.** Portanto, **se** o número final 0200 tem um webhook ativo, o destino dele está **fora deste projeto**: outro projeto Vercel, outra hospedagem, uma função em outro serviço (por exemplo, funções do Supabase) ou **nenhum** (número usado só na caixa de entrada do Gerenciador do WhatsApp).

**Não verificado (fora da autorização ou do alcance):** o código-fonte do CRM; os demais projetos da conta Vercel (existem outros, como `gibson-ai-cloud` e `dino.gibsonpromocoes.com.br`, que **não** inspecionei); serviços fora da Vercel. A resposta definitiva sobre o 0200 só vem do painel da Meta (checklist 22.3).

### 22.3 Checklist do painel da Meta (preenchimento manual, pelo responsável)

**Não peça nem registre aqui:** Access Token, App Secret, Verify Token, PIN, código de autenticação ou chaves privadas. Para o Verify Token, anote só "configurado: sim/não" e onde ele está guardado. Nomes de menu da Meta podem variar; o caminho é indicativo.

| # | Dado a anotar | Onde procurar | Valor |
|---|---|---|---|
| 1 | App ID | developers.facebook.com → app "Gibson Atendimento" → Configurações → Básico | (esperado 1618887669882753) |
| 2 | Nome do aplicativo | mesma tela | |
| 3 | WABA ID | Gerenciador do WhatsApp ou WhatsApp → Configuração da API | (esperado 2225871044650782) |
| 4 | Business ID | Configurações da empresa → Informações | (esperado 729986122385000) |
| 5 | **Callback URL atual** | app → WhatsApp → Configuração → Webhook | |
| 6 | Verify Token configurado? | mesma tela (não copie o valor) | sim / não |
| 7 | **Campos assinados** (ex.: `messages`) | mesma tela → campos do webhook | |
| 8 | **Aplicativos inscritos na WABA** | Configurações da empresa → Contas → Contas do WhatsApp → a WABA → Aplicativos | |
| 9 | **Phone Number IDs vinculados**, cada um com o número exibido | WhatsApp → Configuração da API / Gerenciador | 7064 → (esperado 1352142871312651); 0200 → ? |
| 10 | **Sistema que recebe hoje o número 0200** (caixa de entrada da Meta, CRM, outro software ou nenhum) | você / equipe | |
| 11 | **Ambiente onde o webhook atual está hospedado** (Vercel, outro provedor, outro domínio) — deduzido da Callback URL do item 5 | — | |
| 12 | **Status da assinatura da WABA no app** (inscrita ou não) | Aplicativos da WABA (item 8) | |
| 13 | Existe **configuração independente por número** no painel? Se sim, **capture a tela** e anote o caminho exato; **não altere nada** | painel do número | sim / não |

Referência oficial para conferência: documentação de webhooks da WhatsApp Cloud API (`developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/`).

## 23. Roteamento por `phone_number_id` (arquitetura oficial)

**Modelo:** callback **único** do aplicativo; o aplicativo está inscrito na WABA; eventos dos números vinculados chegam ao **mesmo** callback; a separação é **obrigatória no backend**, pelo `phone_number_id`. Não se considera URL exclusiva por número, salvo evidência explícita no painel (seção 12). **Nenhuma URL é salva ou substituída na Meta** até se conhecer o destino do 0200.

O endpoint existente (`/api/whatsapp/webhook`) é **ampliado**; não haverá segunda rota concorrente. Só o ID `1352142871312651` chega ao agente. Em **produção** ele é conferido em duas fontes (constante no código e `WHATSAPP_PHONE_NUMBER_ID`); se divergirem, o agente fica desligado. Em **homologação** o ID esperado vem só do ambiente (o número de teste da Meta) e o checklist exige confirmar que **não** é o de produção.

```
        Meta Cloud API  ·  app "Gibson Atendimento"  ·  WABA 2225871044650782
                                     │  POST (callback único do app)
                                     ▼
                     /api/whatsapp/webhook   (endpoint existente, ampliado)
                                     │
              1. valida X-Hub-Signature-256 ── inválida ──► 401 (nada é processado)
                                     │ válida
              2. responde 200 rápido; o resto roda depois da resposta
                                     │
              3. para cada entry → changes → value.metadata.phone_number_id
                                     │
      ┌──────────────────────────────┼──────────────────────────────────┐
      ▼                              ▼                                  ▼
 1352142871312651              QUALQUER OUTRO ID                    ID AUSENTE
 (Quinta Hits · 7064)          (ex.: Gibson · 0200)                      │
      │                              │                                  ▼
      │                 ┌────────────┴────────────┐          registra 'ignorado_sem_numero'
      │                 ▼                         ▼            + ACK, sem resposta
      │      existe manipulador seguro?      não existe (hoje)
      │      sim → fluxo existente ou             │
      │            encaminhamento seguro          ▼
      │            (só após autorização)   registra 'ignorado_outro_numero'
      │                                    (sem conteúdo, sem telefone)
      │                                    + ACK 200 · NUNCA responde
      ▼
 4. tratador Quinta Hits
      deduplica por wamid  →  ignora se já visto
        ├─ mensagem com código QH-NNNNNN ─► fluxo ATUAL (site)     ← prioridade sempre
        ├─ agente ligado (env E banco) e contato liberado (modo teste) ─► agente (máquina de estados)
        └─ senão ─► comportamento atual (resposta padrão)
      envios só se WHATSAPP_SEND_ENABLED (env E banco) e sem pausa de emergência
```

**Regra dura, com teste automatizado obrigatório:** mensagem de qualquer outro `phone_number_id` **nunca** aciona o agente e **nunca** gera resposta.

**Onde ficam os eventos do 0200 — decidir só depois do checklist 22.3:**

| O que o painel mostrar | Consequência | Caminho |
|---|---|---|
| **Nenhum sistema** recebe o 0200 hoje | nosso endpoint pode ser o callback; o 0200 é recebido e ignorado | mais simples |
| **Há outro destino** para o 0200 (outro software/host) | trocar o callback do app cortaria esse destino | opções: (a) nosso endpoint **encaminha** os eventos do 0200 ao destino atual, preservando corpo e assinatura originais, com autorização e teste; (b) o destino atual encaminha os do 7064 para nós; (c) usar outro aplicativo para o número da Quinta Hits (viabilidade a verificar na documentação da Meta) |
| O painel mostrar **configuração por número** | só com evidência e captura; **sem executar** | reavaliar |

Se a Meta enviar ao mesmo callback os eventos de **outro** aplicativo inscrito na WABA, isso será mapeado no item 8 do checklist antes de qualquer mudança.

## 24. Checklist do projeto Supabase de homologação

Somente o que você precisa fazer. **Não aplico a migração** enquanto você não disser que o projeto foi criado e autorizar expressamente.

| Etapa | O que fazer |
|---|---|
| **Nome recomendado** | `quinta-hits-homologacao` |
| **Região recomendada** | América do Sul (São Paulo, `sa-east-1`). Confira a região do projeto de produção (Settings → General) e use a **mesma** |
| **Variáveis a copiar** | só duas, de Settings → API: **Project URL** e a chave **service_role**. Guarde em `.env.development.local` (não vai para o git; no `npm run dev` ele vence o `.env.local`, então o dev usa homologação e o build de produção segue com o `.env.local`). **Não cole no chat.** Não precisa da chave anon, da senha do banco nem do JWT secret |
| **Autenticação** | Authentication → Sign In / Providers: e-mail habilitado e **"Allow new users to sign up" desligado**. Authentication → Users → Add user → Create new user, com um e-mail próprio da homologação e **Auto Confirm User**. Esse e-mail vai em `ADMIN_EMAILS` da homologação |
| **Aplicação das migrações** | SQL Editor, **um arquivo por vez, nesta ordem**: 1) `schema.sql`; 2) `migracao-2026-09-21-agente-whatsapp.sql`; 3) `update wa_config set ambiente = 'homologacao' where id = 1;`. Cada um deve terminar em "Success". Se der erro, pare e me mande a mensagem |
| **Seed fictício** | `homologacao/seed-ficticio.sql` (recusa rodar se o passo 3 foi esquecido ou se houver reserva real) |
| **Teste de RLS** | 1) rodar `homologacao/verificar-homologacao.sql`. 2) em consultas separadas: `set role anon; select count(*) from wa_contatos;` → esperado **ERROR: permission denied**; `reset role;` `set role authenticated; select count(*) from wa_conversas;` → esperado **permission denied**; `reset role;` |
| **Teste de reversão** | rodar `reverter-2026-09-21-agente-whatsapp.sql` → conferir no Table Editor que as 12 tabelas sumiram e que `edicoes`, `mesas`, `reservas` continuam; rodar a migração de novo, o passo 3 e o seed; rodar a verificação outra vez |
| **Critério de aprovação** | (1) todos os scripts terminam sem erro; (2) `verificar-homologacao.sql` mostra **RESULTADO GERAL = APROVADO** e nenhuma linha FALHA (51 checagens); (3) os dois testes de RLS dão **permission denied**; (4) a reversão e a reaplicação funcionam; (5) o endereço do projeto é **diferente** do de produção; (6) nenhum dado pessoal real no banco |

## 25. Endpoint público de homologação: comparação e recomendação

**Nada foi configurado.** A homologação precisa de uma URL HTTPS pública, estável e **sem login na rota do webhook**, com o restante do sistema protegido, assinatura válida no POST, Verify Token no GET, `WHATSAPP_AGENT_ENABLED=false` e `WHATSAPP_SEND_ENABLED=false`.

| Critério | 1. Projeto Vercel **separado** de homologação | 2. Domínio de homologação **dentro do projeto atual** | 3. **Túnel** temporário (só dev local) |
|---|---|---|---|
| Isolamento de dados e segredos | **total**: variáveis e Supabase próprios | fraco: mesmo projeto, variáveis por ambiente; erro de configuração mistura produção e teste | depende do computador; usa o `.env.development.local` |
| Risco de afetar a produção | **mínimo** (outro projeto, outro domínio) | **alto**: um deploy ou promoção errados atingem a produção | nenhum sobre a produção, se o `.env` estiver certo |
| Estabilidade da URL | **estável** (`quinta-hits-hml.vercel.app`) | estável só com recursos que dependem do plano | **instável**: muda ou cai quando o computador desliga |
| Serve como callback contínuo | **sim** | sim, com ressalvas | **não** (a URL é temporária) |
| Restante do sistema protegido | sim, por código: com `APP_AMBIENTE=homologacao` tudo exige login de admin **exceto** o webhook, e `noindex` | idem, mas em cima do site de produção | quem tiver o link acessa o que estiver rodando |
| Custo e esforço | baixo: mais um projeto na conta | baixo, mas com risco de plano | baixo |
| Adequação à regra "sem preview temporário como callback" | **atende** | atende só com domínio fixo | **não atende** (dev apenas) |

**Recomendação (a mais segura): opção 1.** Projeto Vercel separado, com o Supabase de homologação e domínio estável. A opção 3 serve só para depurar localmente, sem virar callback permanente. A opção 2 é a de maior risco de misturar ambientes.

**Ponto crítico:** como o callback é **por aplicativo**, cadastrar a URL de homologação no app "Gibson Atendimento" mudaria o destino dos eventos reais, inclusive os do 0200. Por isso, recomendo que a homologação com a Meta use um **aplicativo de teste separado**, com o **número de teste** que a própria Meta oferece para apps em modo de desenvolvimento (só envia a um pequeno número de destinatários previamente verificados, todos autorizados; conferir o limite atual na documentação da Meta). Assim o app de produção, o número 7064 e o número 0200 **não são tocados**. A criação desse app é decisão e ação sua, e **não foi feita**.

## 26. Autorizações necessárias (nada disto foi ou será feito sem elas)

| # | Ação | Quando pedirei | Depende de |
|---|---|---|---|
| 1 | Aplicar **migração e seed** no Supabase de **homologação** | depois de você criar o projeto e avisar | checklist da seção 24 |
| 2 | Iniciar a **implementação do código** (endpoint ampliado com roteador, serviço de envio, máquina de estados, painel, rotina de limpeza), com `AGENT` e `SEND` desligados, só em commits locais | após a aprovação desta entrega | — |
| 3 | Inspeção **somente leitura** de **outros projetos Vercel** (nomes de variáveis) para achar o destino do 0200 | se o checklist da Meta não bastar | itens 10 e 11 do checklist |
| 4 | Criar o **projeto Vercel de homologação** e cadastrar as variáveis dele | depois do item 1 | Supabase de homologação |
| 5 | Cadastrar a URL de homologação no **app de teste da Meta** (você cria o app) | depois do item 4 | app de teste e número de teste |
| 6 | **Leituras somente-leitura na Graph API** (conferir token, WABA e número) | antes do registro | token cadastrado direto na Vercel |
| 7 | Alterar o **fluxo atual do site** para respeitar `disponivel_site` (hoje o site oferece todas as mesas ativas) | se você quiser alinhar os canais | — |
| 8 | **Push**, **deploy** e **merge** de cada etapa | a cada etapa | — |
| 9 | **Registro do número** (`/register`, com PIN digitado por você no terminal) | só depois de: banco pronto, webhook preparado, testes locais aprovados e variáveis configuradas | autorização expressa |
| 10 | **Salvar ou substituir a URL no app de produção** da Meta | só após decidir o destino do 0200 (seção 23) | checklist 22.3 preenchido |
| 11 | **Migração em produção** | após homologação aprovada e política de retenção validada por escrito | itens 1 a 9 |
| 12 | Ligar **envio** para números de teste, depois liberação gradual e app "Ao vivo" | etapas finais | tudo acima |

Local oficial: **Florindos Bar — Uberlândia/MG**. Nunca mencionar Tatu Bola.

## 27. Diário da implementação local (etapa 3 — iniciada em 21/09/2026)

Autorizado: implementar e testar **localmente**. Continua proibido: SQL em qualquer Supabase, configurar a Meta, `/register`, enviar mensagem real, push, deploy, acessar ou exibir segredos. `WHATSAPP_AGENT_ENABLED` e `WHATSAPP_SEND_ENABLED` seguem `false` (e nascem `false` quando ausentes). Antes de cada commit rodam: lint, verificação de tipos e testes.

**Comandos** (na pasta `SITE`): `npm run lint` · `npm run typecheck` · `npm test` · `npm run test:watch`.

### 27.1 Infraestrutura de testes e lint

- **Dependências de desenvolvimento** (versões exatas): `vitest`, `@electric-sql/pglite`, `eslint`, `eslint-config-next`, `@eslint/eslintrc`. Nenhuma dependência de produção foi adicionada. A auditoria do npm mostra 2 vulnerabilidades **já existentes** em `next`/`postcss` (produção), não introduzidas aqui; ficam como pendência.
- **Lint:** `eslint . --max-warnings=0` (configuração oficial do Next). O ponto de partida tinha 5 avisos no código antigo, todos corrigidos (importação sem uso no webhook e 3 efeitos de carga inicial documentados).
- **Testes:** `tests/`. O banco dos testes é um PostgreSQL 17 em memória (PGlite) com o `schema.sql` e a migração **reais**, mais um adaptador mínimo com a interface do `supabase-js` (`tests/helpers/bancoTeste.ts`). O código de produção roda contra as restrições reais (índices únicos, checks) sem rede e sem credencial.
- **Rede e ambiente bloqueados por padrão** (`tests/setup.ts`): todas as variáveis sensíveis são zeradas antes de cada teste e qualquer `fetch` não simulado lança erro, então nenhum teste pode falar com a Meta nem com um Supabase.
- **Limite:** o adaptador não é o Supabase real (não exercita PostgREST nem os papéis reais); a homologação continua obrigatória.

### 27.2 Roteamento do webhook por `phone_number_id` (fluxo atual preservado)

**Endpoint ampliado, sem segunda rota:** `POST /api/whatsapp/webhook` continua validando a assinatura e respondendo 200; agora separa cada evento pelo `phone_number_id`.

| Evento | Resultado |
|---|---|
| `1352142871312651` (QUINTA HITS) | tratado pelo fluxo atual `QH-NNNNNN` (lógica **movida sem alteração** para `lib/whatsappLegado.ts`) |
| qualquer outro ID (ex.: o final 0200) | **HTTP 200, sem processar e sem resposta automática**. Log sanitizado; com o agente ligado por variável, grava também em `wa_webhook_eventos` (só ID do número e tipo; **sem conteúdo e sem telefone**; deduplicado) |
| sem `phone_number_id` | idem |
| atualização de status e mensagem que não é texto | ignoradas por ora (o fluxo atual não as usa) |

**Arquivos novos:** `lib/agente/ambiente.ts` (interruptores e regras de ID), `lib/whatsappEventos.ts` (leitura do payload, com texto, resposta de botão/lista e status), `lib/agente/roteador.ts` (classificação), `lib/agente/eventos.ts` (idempotência e registro de ignorados), `lib/whatsappLegado.ts` (tratador atual). **Alterados:** `app/api/whatsapp/webhook/route.ts` e `lib/whatsapp.ts`.

**Regras de segurança implementadas:**

- **Produção:** o ID da QUINTA HITS é a constante oficial (não depende de variável). **Homologação:** vem de `WHATSAPP_PHONE_NUMBER_ID` (número de teste da Meta) e **nunca** pode ser o de produção. Configuração insegura ⇒ nenhum evento é da QUINTA HITS.
- **Envio:** `enviarTexto` só envia com `WHATSAPP_SEND_ENABLED=true` (padrão desligado) **e** só se `WHATSAPP_PHONE_NUMBER_ID` for exatamente o número da QUINTA HITS do ambiente. Se a variável apontar para outro número (ex.: o 0200), **não envia nada**.
- `META_GRAPH_API_VERSION` passa a definir a versão da Graph API (padrão `v21.0`, o que já era usado).
- Interruptores nascem **desligados**: só `"true"` liga; o repasse humano nasce ligado.

**Mudança de comportamento do fluxo atual, a saber:** a confirmação da reserva no banco é a mesma, mas a **resposta ao cliente** agora depende de `WHATSAPP_SEND_ENABLED=true`. Hoje a produção não tem nenhuma variável `WHATSAPP_*`, então nada muda; **no go-live o envio precisa ser ligado**, o que consta no checklist de produção.

**Testes (39 novos, 47 no total):** leitura de payload (texto, botão, lista, status, lixo, dois números no mesmo callback); classificação; interruptores e IDs por ambiente; a rota completa contra o banco em memória, cobrindo GET, assinatura, o fluxo `QH-NNNNNN` (confirma, minúsculas, repetição, outro número do cliente, código inexistente, pedido vencido, mesa pega), o isolamento do 0200 (mensagem com código válido de outro ID **não confirma nem responde**, sem ID, status, callback com os dois números, registro sem conteúdo e sem telefone) e a homologação.

**Não coberto:** o `next build` não foi rodado nesta etapa para não ler as credenciais reais do `.env.local`; lint, tipos e testes passam. Rodar o build no ambiente de homologação.

### 27.3 Disponibilidade única por canal (site, WhatsApp e painel sobre o mesmo estoque)

**Nova consulta única** `lib/disponibilidade.ts`, usada por **todos** os canais. O estoque continua sendo um só: `mesas` + `reservas` + o índice único parcial do banco. `edicoes_mesas` só decide **quem pode oferecer** a mesa; nunca guarda quantidade nem status de reserva.

| Mesa na edição | Site | WhatsApp | Painel |
|---|---|---|---|
| sem linha em `edicoes_mesas` (comportamento de hoje) | oferece | **não** oferece | oferece |
| com linha | `disponivel_site` | `disponivel_whatsapp` | `disponivel_admin` |
| três desligados, ou `mesas.ativa = false` | indisponível | indisponível | indisponível |

Funções: `estoqueDaEdicao` (expira pedidos vencidos, lê mesas, ocupação e canais), `mesasDoCanal`, `mesasLivres(edicao, canal, pessoas?)` e `verificarMesa` (explica o motivo: inexistente, canal indisponível, lugares insuficientes ou ocupada). O ajuste `lugares_override` vale para todos os canais.

**Integração com o site (alteração mínima e compatível):**

- `mapaDaEdicao` (mapa do site) e `POST /api/reservas` passam a usar essa consulta. **"Ocupada" não barra no site:** quem decide a disputa continua sendo o índice único, na gravação, com a mesma resposta 409 de antes.
- **Sem a migração aplicada (estado da produção hoje), tudo se comporta exatamente como antes**: a consulta da tabela nova falha de forma tratada (`42P01`/`PGRST205`), o resultado é "canais não configurados" e a falha não se repete por 60 s. Testado contra um banco **sem** a migração.
- `expirarPedidosVencidos` foi movida para `lib/expiracao.ts` (evita ciclo de importação) e segue exportada por `lib/reservas.ts`; nenhum chamador mudou.

**Testes (19 novos, 66 no total):** padrão sem configuração; liberação por canal; "indisponível"; mesa inativa; **estoque único** (reserva de um canal tira a mesa de todos, inclusive reserva vinda do agente); mesa fora do WhatsApp reservada pelo site; expiração; ajuste de lugares; motivos de `verificarMesa`; mapa do site igual ao de sempre e com mesa escondida; `POST /api/reservas` (cria como sempre, 404 com mesa desligada para o site ou só do WhatsApp, 400 com capacidade efetiva, 409 com mesa segurada por outro canal, 404 com mesa inativa); e o **banco sem migração** (mapa e `POST` iguais aos de antes).

**Ainda não feito:** as telas do painel para configurar os canais (commit de regras por edição). Ainda **não há** a reserva feita pelo agente; a corrida site × WhatsApp na mesma mesa será testada com ela.

### 27.4 Regras de reserva por edição e canais das mesas (API e painel)

**Princípio:** nenhum valor é inventado. Campo vazio = "ainda não definido"; nada tem valor padrão operacional. O agente **só atende uma edição pronta**; em qualquer outra, não informa disponibilidade, não confirma nada e repassa para uma pessoa.

**Prontidão da edição** (`avaliarProntidao`, função pura): pronta somente se **todos** os itens existem: edição futura, aberta e não cancelada; horário do evento e local; horário de abertura; prazo final para reservar (e ainda não vencido); tolerância; prazo de cancelamento; capacidade máxima; consumação mínima (0 = sem consumação; vazio = indefinido); instruções de chegada; ao menos uma mesa liberada para o WhatsApp; e a liberação explícita da edição. Preço e sinal são opcionais e só informativos. A lista de obrigatórios é uma proposta e fica em um único lugar do código (`lib/regrasEdicao.ts`), fácil de ajustar.

**Arquivos novos:** `lib/regrasEdicao.ts` (tipos, validação e prontidão, sem banco), `lib/regras.ts` (leitura/gravação, lista de edições prontas), `lib/auditoria.ts`, `app/api/admin/edicoes/[id]/regras/route.ts` (GET e PUT, sob sessão de admin) e `app/admin/RegrasEdicaoPainel.tsx`. **Alterados:** `AdminDashboard.tsx` (nova seção) e `lib/disponibilidade.ts` (expõe lugares da mesa e ajuste).

**Painel:** seção "Regras da edição & canais das mesas". Mostra em destaque **"NÃO está pronta para reservas automáticas… Faltam: …"** ou "Pronta…"; formulário das regras; tabela de mesas com as caixas Site, WhatsApp e Painel, o ajuste de lugares e o botão "Indisponível". Sem a migração aplicada, mostra um aviso e não altera nada.

**Segurança e auditoria:** as rotas exigem sessão de admin (além do middleware). Cada gravação registra em `auditoria` **apenas nomes de campos e contagens**, nunca os valores. Pedido inválido é recusado por inteiro (nada é salvo pela metade). **Limite conhecido:** o cookie de sessão do painel não carrega a identidade de quem entrou, então o ator da auditoria é "admin"; para o atendimento humano o atendente informa o próprio nome na tela (ver seção de atendimento).

**Testes (28 novos, 94 no total):** validação (normalização, vazio = não definido, valores inválidos); prontidão item a item (cada item faltando reprova sozinho; consumação 0 conta como definida; edição passada, cancelada e prazo vencido); a API completa contra o banco em memória (sem sessão 401, id inválido 400, edição sem regras mostra NÃO pronta, PUT completo deixa PRONTA, PUT parcial preserva o resto, inválido não salva nada, edição/mesa inexistente 404, auditoria sem valores, canais valem no estoque único); lista de edições prontas para o agente; e o banco **sem a migração** (`{ migrado: false }` e 503, sem quebrar).

**Não coberto por teste automatizado:** o componente de tela (`RegrasEdicaoPainel.tsx`), que não tem teste de interface neste projeto; passa em lint e verificação de tipos e será conferido visualmente na homologação.

### 27.5 Base do agente: contatos, conversas, mensagens e idempotência

**Arquivos novos** (`src/lib/agente/`): `telefone.ts` (telefone do cliente a partir do `wa_id`), `ativacao.ts` (quando o agente responde e quando o envio é permitido), `tipos.ts` (estados, contexto, mensagens e as "portas" da máquina de estados), `repositorio.ts` (dados). Já existia `eventos.ts` (idempotência dos eventos).

- **Telefone:** celular brasileiro de 11 dígitos, completando o 9 que a Meta às vezes omite; número não brasileiro fica com telefone nulo e o agente **repassa para uma pessoa** (não reserva).
- **Ativação — vale o mais restritivo** entre a variável de ambiente (interruptor mestre) e a configuração do banco (botões do painel): agente e envio são interruptores **independentes**; a **pausa de emergência** derruba os dois na hora; no **modo teste** só números da lista recebem resposta (lista vazia = ninguém); se `APP_AMBIENTE` diferir de `wa_config.ambiente`, tudo fica desligado.
- **Contatos:** criados quando o cliente escreve (é o consentimento para o atendimento); nome do perfil só preenche se estava vazio; eventos simultâneos criam **um só** contato.
- **Conversas:** no máximo uma aberta por contato (garantido pelo banco); depois de encerrada, abre outra. **Trava otimista** por `versao`: duas gravações concorrentes com a mesma versão lida, só uma vence e a outra recebe "conflito" (quem chama relê e refaz); nada é sobrescrito.
- **Mensagens:** `wamid` único; a repetição vira "já vista". Status de entrega só avança (enviada → entregue → lida) e "falhou" sempre vale, com o código do erro (sem detalhe).
- **Idempotência:** `wa_webhook_eventos` (uma entrega "nova" entre dez simultâneas); status usam a chave `wamid:status`.
- **Limite por contato:** contagem de mensagens do cliente na última hora (o limite vem de `wa_config`).

**Testes (24 novos, 118 no total):** telefone; as regras de ativação (todas as combinações relevantes); contatos, conversas, mensagens e idempotência contra o banco em memória, incluindo **corrida de gravação de conversa** e **dez entregas simultâneas do mesmo evento**; e o banco **sem a migração** (configuração nula, registro "indisponível", sem lançar).

### 27.6 Máquina de estados determinística (fase 1, sem IA)

**Arquivos:** `lib/agente/maquina.ts` (a máquina) e `lib/agente/textos.ts` (todas as respostas). A máquina **não acessa banco nem rede**: tudo que vem de fora passa pelas "portas" (`lib/agente/tipos.ts`: edições prontas, mesas livres, criar/cancelar/atualizar reserva, reservas do contato, relógio). Por isso o mesmo código roda em produção, nos testes e na demonstração simulada, e dá para trocar as regras de interpretação sem tocar em dados.

**Estados** (os 14 do prompt): `NEW`, `WELCOME`, `SELECTING_EVENT`, `ASKING_GUEST_COUNT`, `CHECKING_AVAILABILITY`, `SELECTING_TABLE`, `COLLECTING_NAME`, `COLLECTING_NOTES`, `REVIEWING_RESERVATION`, `CONFIRMED`, `ALTERING_RESERVATION`, `CANCELLING_RESERVATION`, `WAITING_HUMAN`, `CLOSED`.

**Fluxo de reserva:** boas-vindas com menu (Reservar mesa · Minhas reservas · Falar com a equipe) → edição (uma só edição pronta segue direto; várias viram lista) → quantas pessoas → **consulta a disponibilidade real** → lista de mesas livres (até 10) → nome → observações → resumo com as regras cadastradas → **Confirmar** → grava → só então envia o código `QH-NNNNNN`. O cliente responde **por toque, pelo número da opção, ou escrevendo** (por exemplo, "08/10").

**Também no menu:** minhas reservas; cancelar (com confirmação; fora do prazo ou prazo não cadastrado vira transferência); alterar **nome** e **observações**. Mudança de mesa, número de pessoas ou data é "Outra mudança" e vai para a equipe (alterar mesa mexe no estoque e fica com uma pessoa na fase 1).

**Sempre vira atendimento humano:** o cliente pedir uma pessoa ou atendente; falar de pagamento, sinal, PIX, estorno; reclamação; duas mensagens seguidas sem entender numa etapa; edição sem regras completas ou não liberada; reserva que falhou por erro ou limite; mensagem do cliente com número que não é celular brasileiro. Enquanto a conversa está com uma pessoa (`WAITING_HUMAN`), **o agente não responde nada**.

**Regras de conteúdo (protegidas por teste):** todo local é o **Florindos Bar, em Uberlândia**; **nenhuma resposta cita "Tatu Bola"**, mesmo que o termo apareça em um campo escrito no banco (é filtrado); **nada é inventado**: o resumo só cita as regras cadastradas (campo vazio não aparece); respostas dentro dos limites da Cloud API (até 3 botões de 20 caracteres, lista de até 10 itens, corpo até 1024).

**Segurança de comportamento:** nome com a palavra "atendente" não dispara transferência (só a frase exata); conversa parada por mais de 24 h recomeça do menu; a máquina é determinística (mesma conversa, mesmas respostas); o contexto guardado não carrega segredos nem texto além do necessário. **Ainda sem IA**: a arquitetura permite plugar um interpretador de intenção no lugar das palavras-chave no futuro, atrás de flag.

**Testes (48 novos, 166 no total):** primeiro contato e menu; fluxo completo com verificação de que grava **uma vez** e **só depois** confirma; falhas de gravação nunca produzem "Reserva confirmada"; mesa tomada no meio; sem mesa; leitura de pessoas ("quatro", "somos 6"); nome e observações; alterar o pedido; edição sem regras (nada é inventado); dúvidas repetidas e mensagens que não são texto; transferências (oito frases e as três motivações); cancelar e alterar; expiração de 24 h; e as regras de conteúdo (sem Tatu Bola, local, limites do WhatsApp, determinismo, estados oficiais).

**Defeitos achados pelos próprios testes e corrigidos:** a normalização do texto não limpava a pontuação quando havia espaço depois dela, e "preciso de uma pessoa" não era reconhecido como pedido de atendente.

### 27.7 Fila de saída (envio real desativado) e reservas do agente

**Arquivos:** `lib/agente/graph.ts` (payload da Cloud API, política de reenvio, sanitização de erro, janela de 24 h; puro), `lib/agente/fila.ts` (fila e envio) e `lib/agente/reservas.ts` (reservas do agente).

**Fila (outbox no Postgres):** toda resposta do agente é gravada em `wa_fila_saida` **antes** de qualquer envio, com chave de idempotência (a mesma chave nunca gera dois envios).

- **O envio só acontece quando TUDO permite:** variável `WHATSAPP_SEND_ENABLED=true` **e** `wa_config.envio_ativo` **e** sem pausa de emergência **e** ambiente igual **e** (no modo teste) destinatário na lista de testes. Com o padrão de fábrica, **nenhum item sai**: fica `pendente` e a rede nem é tocada. Destinatário fora da lista de testes é `cancelada` sem envio.
- **Número de envio:** o envio real recusa por conta própria se `WHATSAPP_PHONE_NUMBER_ID` não for exatamente o número da QUINTA HITS do ambiente (por exemplo, se apontar para o final 0200) ou se faltar o token: o item permanece pendente.
- **Reenvio:** 429, 5xx e falha de rede tentam de novo com espera de 30 s, 60 s, 2 min… (teto de 1 h) e respeitam o `retry-after` da Meta; erro definitivo (4xx) não repete; ao esgotar as tentativas o item vai para **dead-letter** (`morta`). Cada tentativa fica em `wa_fila_tentativas` (HTTP, código e detalhe sanitizado, duração).
- **Janela de 24 h:** fora dela não se envia texto livre (só template aprovado, ainda não cadastrado): o item falha com `fora_da_janela_24h`.
- **Proteções:** limite de saídas por contato na hora (o excedente é adiado, não descartado); trava por compare-and-set (dois processadores nunca enviam o mesmo item); trava vencida devolve o item à fila; depois de enviado, o texto some do `payload` da fila.
- **Sanitização:** o detalhe de erro guardado nunca leva token nem telefone.
- `appsecret_proof` só entra quando `META_APP_SECRET_PROOF_ENABLED=true`.

**Reservas do agente** escrevem na **mesma tabela do site** e disputam a **mesma trava do banco**: nascem `confirmada`, com `origem_reserva = 'whatsapp_agent'`, código `QH-NNNNNN` e vínculo ao contato. Antes de gravar: edição aberta e pronta, mesa oferecida ao WhatsApp e livre com lugares suficientes, limite de reservas ativas por WhatsApp (o mesmo do site). Falha do índice único = "mesa indisponível". Cancelamento respeita `cancelamento_ate_horas` (prazo não cadastrado ou vencido vira transferência); só o dono do número cancela ou altera a própria reserva; alterar nome e observações não mexe no estoque. A auditoria guarda apenas ação e campos, nunca valores.

**Testes (41 novos, 207 no total):** payload e limites da Cloud API; política de reenvio; sanitização; janela de 24 h; fila com envio desligado por variável, por banco, por pausa e por modo teste; envio simulado, 429 com `retry-after`, 5xx até o dead-letter, erro definitivo, fora da janela, limite por hora, trava vencida e **dois processadores simultâneos (enviado uma só vez)**; chamada real à Graph API com `fetch` simulado (versão, Bearer, `appsecret_proof`, **sem rede quando o número de envio está errado**); reservas do agente; e a **corrida entre site e WhatsApp pela mesma mesa**: seis rodadas alternando quem chega primeiro (só uma operação aceita), seis tentativas simultâneas dos dois canais (exatamente uma reserva existe) e a devolução da mesa ao cancelar.

### 27.8 Orquestrador, atendimento humano e painel

**Orquestrador** (`lib/agente/orquestrador.ts`), na ordem: interruptores → **idempotência** (`wamid`) → contato → conversa → registro da mensagem → limite por hora → **máquina de estados** → gravação do novo estado com **trava otimista** → **fila de saída** → transferência para humano. Só as respostas são **enfileiradas** aqui; o envio real é outro passo (a fila) e segue desligado por padrão. Em caso de conflito de gravação relê a conversa e refaz (sem enfileirar nada antes de gravar), com as respostas protegidas por chave de idempotência.

**Roteamento final do webhook para a QUINTA HITS:** (1) mensagem com código `QH-NNNNNN` → **fluxo atual, sempre com prioridade**; (2) senão, agente ligado (variável **e** banco), fora da pausa e contato na lista de testes → agente; (3) senão → resposta padrão do fluxo atual. Sem a migração no banco, ou com o agente desligado, o comportamento é o de sempre. O processamento da fila roda **depois** da resposta à Meta (`after()` do Next; fora de requisição executa direto). O status de entrega das mensagens do agente é aplicado com idempotência.

**Situações tratadas:** contato bloqueado (ignorado); número não brasileiro (equipe); excesso de mensagens por hora (sem respostas); repasse humano desligado por variável ou pelo banco (avisa que não consegue continuar e encerra, sem prometer atendimento).

**Atendimento humano** (`lib/agente/atendimento.ts`, rotas `api/admin/whatsapp/atendimento`, tela `AtendimentoPainel.tsx`):

- A transferência abre um registro em `wa_transferencias` (uma aberta por conversa), muda a conversa para "aguardando humano" e **o agente para de responder**. Mensagens do cliente nesse período só atualizam a atividade.
- **Painel:** seção no topo, **em destaque** (borda e selo em terracota) quando há alguém aguardando, com **contador** também no título do painel; motivo da transferência; última mensagem; histórico da conversa; **Assumir** (só o primeiro assume), **Enviar** resposta, **Devolver ao agente** (recomeça do menu, histórico preservado) e **Encerrar** (uma nova mensagem do cliente abre outra conversa). Atualiza sozinho a cada 15 s.
- Como o número é exclusivo da API, **a resposta do atendente é enviada pelo painel** e passa pela **mesma fila** (respeita a janela de 24 h, o modo teste, a pausa e o envio desligado).
- O cookie de sessão do painel não guarda identidade: o atendente informa o próprio nome (lembrado no navegador) e ele vai para a auditoria, **sem o texto das mensagens**.
- **Pausa de emergência** no painel (`api/admin/whatsapp/config`): derruba agente e envio na hora, sem redeploy. Ligar agente e envio **não** é feito pelo painel nesta fase.
- Sem a migração aplicada, o painel só mostra um aviso.
- **Notificações externas** (e-mail ou WhatsApp para a equipe): **não implementadas**, conforme a decisão; a fila do painel é o único aviso. A arquitetura comporta um disparo futuro no ponto em que a transferência é aberta.

**Testes (27 novos, 234 no total):** 15 de integração pelo webhook (agente desligado por variável, por banco, por lista de testes e por pausa; base sem a migração; conversa completa até a reserva com `origem_reserva = whatsapp_agent`, todas as respostas enfileiradas e **nada enviado**; entrega repetida processada uma vez; **código `QH-NNNNNN` com prioridade**; envio ligado com tudo liberado; número 0200 sem nenhum efeito; edição sem regras vai para a equipe; bloqueado, não brasileiro e limite por hora; status de entrega; transferência com o agente em silêncio, assumir, devolver e reencerrar; pagamento e reclamação; repasse desligado) e 12 da API do painel (sessão, listagem, histórico, ações, validações, **dois atendentes assumindo ao mesmo tempo**, auditoria sem conteúdo, sem migração, pausa de emergência).

### 27.9 Rotinas de retenção (modo simulação)

**Arquivos:** `lib/agente/retencao.ts` (lógica, independente de framework), `scripts/retencao.mjs` (linha de comando, **só homologação**) e `api/admin/whatsapp/retencao/route.ts` (painel). A política é a da seção 21.7, lida de `wa_config` (mudar o valor muda o corte). **Continua PENDENTE de validação administrativa e jurídica antes da produção.**

**O que cada rodada faz** (a contagem sempre acontece primeiro):

| Etapa | Ação |
|---|---|
| Conteúdo das mensagens (90 d) | apaga o texto e marca `conteudo_removido_em`; a linha (metadados) fica |
| `payload` da fila (90 d) | esvazia itens já finalizados; itens **pendentes são preservados** |
| Detalhe de erro (90 d) | zera `erro_detalhe` em mensagens, fila e tentativas; o **código do erro fica** |
| Metadados e status (12 m) | apaga mensagens e itens finalizados da fila |
| Eventos de webhook (30 d) | apaga |
| Conversas encerradas (12 m) | anonimiza o contato (nome, telefone e observações apagados, `wa_id` vira `anon-…`) e zera o contexto da conversa |
| Reservas (24 m) | anonimiza nome e WhatsApp; mantém edição, mesa, pessoas e status |

**Garantias:** (1) **nasce desligada** e a execução real só é liberada com `RETENCAO_ENABLED=true` **e** `wa_config.limpeza_ativa` **e** o mesmo ambiente na aplicação e no banco **e**, em produção, `politica_retencao_validada_em` preenchida; sem isso a chamada real **lança e não altera nada**; (2) **simulação é o padrão** (só conta); (3) registra **apenas quantidades** em `auditoria`, nunca o conteúdo apagado (nem nos logs); (4) **respeita reservas abertas**: contato com reserva aberta ou futura, conversa aberta ou recente, e reserva de edição de hoje em diante não são tocados; (5) é **idempotente**.

**Script:** `node --env-file=.env.development.local scripts/retencao.mjs --ambiente=homologacao [--executar]`. Recusa rodar sem `--ambiente=homologacao`, sem `APP_AMBIENTE=homologacao`, sem as variáveis do Supabase de homologação ou se o banco não estiver marcado como homologação (`wa_config.ambiente`). Não foi executado contra nenhum banco real.

**Testes (16 novos, 250 no total):** as permissões de execução; simulação sem alterar nada; auditoria só com números; execução recusada por padrão; execução permitida com cada etapa conferida; reservas abertas e contatos vivos preservados; idempotência; prazos vindos da configuração; nenhum conteúdo nos logs; base sem a migração; a rota do painel (401, simulação padrão, 409 sem permissão, execução com tudo liberado); e o **script** (recusas e carregamento direto do módulo TypeScript no Node, sem rede e sem credenciais).

**Limites:** o filtro `payload <> '{}'` sobre a coluna `jsonb` e as atualizações em lote só foram exercitados no banco em memória; precisam ser conferidos no Supabase de homologação. O agendamento periódico (Vercel Cron ou `pg_cron`) **não foi configurado**: a rotina é chamada pelo script ou pelo painel.

<!-- FIM DO DIARIO -->

## Apêndice A — Resultado detalhado das 101 verificações (execução de 21/09/2026)

```
1) Base (schema.sql) e fluxo ATUAL antes da migração
  ✓ reserva do fluxo atual gravada antes da migração
2) Migração (1ª vez) e idempotência (2ª e 3ª vezes)
  ✓ tabela wa_config existe
  ✓ tabela edicoes_regras existe
  ✓ tabela edicoes_mesas existe
  ✓ tabela wa_contatos existe
  ✓ tabela wa_conversas existe
  ✓ tabela wa_transferencias existe
  ✓ tabela wa_mensagens existe
  ✓ tabela wa_webhook_eventos existe
  ✓ tabela wa_fila_saida existe
  ✓ tabela wa_fila_tentativas existe
  ✓ tabela auditoria existe
  ✓ tabela reservas_historico existe
  ✓ reserva antiga ganhou origem_reserva = 'site'
  ✓ reserva antiga intacta (nome, código, status)
  ✓ wa_config nasce desligada, restrita a testes, sem números, ambiente 'producao'
  ✓ retenção nasce com a política do responsável (90 d / 12 m / 90 d / 30 d / 12 m / 24 m)
  ✓ limpeza de retenção nasce DESLIGADA e política NÃO validada
  ✓ retenção com valor zero é recusada
3) Fluxo do site (código QH-NNNNNN) continua igual depois da migração
  ✓ mesma mesa na mesma edição continua barrada (23505)
  ✓ código QH-NNNNNN repetido entre pedidos aguardando continua barrado
  ✓ busca do webhook pelo código (mais recente) encontra o pedido
  ✓ confirmação do webhook: 1ª vez confirma, mensagem repetida NÃO confirma de novo
  ✓ gatilho gravou histórico (nova→aguardando, aguardando→confirmada)
  ✓ pedido vencido vira 'expirada' (expirarPedidosVencidos)
  ✓ reconfirmar pedido expirado cuja mesa foi pega por outro dá 23505 (o webhook responde 'mesa liberada')
4) Novo fluxo e CORRIDA ENTRE CANAIS sobre o mesmo estoque
  ✓ WhatsApp NÃO consegue mesa já confirmada pelo site (23505)
  ✓ SITE NÃO consegue mesa já reservada pelo WhatsApp (23505)
  ✓ PAINEL (admin) NÃO consegue mesa já reservada pelo WhatsApp (23505)
  ✓ origem 'manual' também NÃO consegue a mesma mesa (23505)
  ✓ origem inválida é recusada (check)
  ✓ corrida de 12 tentativas de 4 canais: exatamente 1 aceita e 11 recusadas (23505)
  ✓ a reserva aceita é a da PRIMEIRA tentativa (canal 'site')
  ✓ após cancelar, a mesa volta ao estoque e outro canal reserva
5) Conversas, transferência humana, mensagens, idempotência
  ✓ segunda conversa aberta do mesmo contato é barrada
  ✓ estado fora da lista é recusado
  ✓ só uma transferência aberta por conversa
  ✓ após devolver ao agente, nova transferência pode abrir
  ✓ mesmo wamid duas vezes é barrado (idempotência)
  ✓ várias saídas ainda sem wamid são permitidas
  ✓ mensagem tem coluna de retenção do conteúdo (conteudo_removido_em) e não tem expurgar_em
  ✓ evento de webhook repetido é barrado
  ✓ evento de outro número é registrado só como 'ignorado_outro_numero'
  ✓ destino de evento fora da lista (ex.: 'respondido') é recusado
  ✓ mesma chave de envio duas vezes é barrada (sem disparo duplicado)
  ✓ wa_id inválido é recusado
  ✓ marcador de contato anonimizado ('anon-<32 hex>') é aceito
6) Mesas por canal (uma única fonte de estoque)
  ✓ padrão do canal: site e painel oferecem, WhatsApp NÃO (liberação explícita)
  ✓ 'indisponível' = os três canais desligados é aceito
  ✓ ajuste de lugares fora de 1–50 é recusado
  ✓ tabela de canais não guarda estoque nem status de reserva
7) Segurança: RLS ligado e sem acesso de anon/authenticated
  ✓ RLS ligado em wa_config
  ✓ RLS ligado em edicoes_regras
  ✓ RLS ligado em edicoes_mesas
  ✓ RLS ligado em wa_contatos
  ✓ RLS ligado em wa_conversas
  ✓ RLS ligado em wa_transferencias
  ✓ RLS ligado em wa_mensagens
  ✓ RLS ligado em wa_webhook_eventos
  ✓ RLS ligado em wa_fila_saida
  ✓ RLS ligado em wa_fila_tentativas
  ✓ RLS ligado em auditoria
  ✓ RLS ligado em reservas_historico
  ✓ anon/authenticated sem nenhuma permissão nas tabelas novas
  ✓ nenhuma policy criada nas tabelas novas
  ✓ nenhuma view criada
8) Seed fictício: travas e conteúdo
  ✓ seed recusado em banco marcado 'producao'
  ✓ seed recusado se existem reservas reais
  ✓ seed aplicado (idempotente): 3 edições fictícias, 6 mesas T01–T06
  ✓ regras: 07/01 liberada, 14/01 não
  ✓ 07/01: 6 mesas configuradas; WhatsApp oferece 5 (T06 só site e painel); 14/01 nenhuma
  ✓ horário de abertura inválido é recusado
9) Estoque ÚNICO entre canais (mesas oferecidas pelo WhatsApp × site)
  ✓ antes de reservar: WhatsApp vê T01–T05; site vê T01–T06
  ✓ depois do SITE reservar T05: some da lista do WhatsApp E do site (mesmo estoque)
  ✓ WhatsApp tentando T05 mesmo assim é barrado pelo banco (23505)
  ✓ T06 (não oferecida ao WhatsApp) reservada pelo painel: continua no mesmo estoque
10) Script de verificação da homologação (verificar-homologacao.sql)
  ✓ verificação aprova o banco de teste (51 verificações)
  ✓ verificação REPROVA se anon ganhar acesso a uma tabela nova
  ✓ verificação REPROVA se o envio for ligado por engano
11) Reversão
  ✓ reversão RECUSADA enquanto há reserva do agente
  ✓ ...e nada foi removido na tentativa recusada
  ✓ tabela wa_config removida
  ✓ tabela edicoes_regras removida
  ✓ tabela edicoes_mesas removida
  ✓ tabela wa_contatos removida
  ✓ tabela wa_conversas removida
  ✓ tabela wa_transferencias removida
  ✓ tabela wa_mensagens removida
  ✓ tabela wa_webhook_eventos removida
  ✓ tabela wa_fila_saida removida
  ✓ tabela wa_fila_tentativas removida
  ✓ tabela auditoria removida
  ✓ tabela reservas_historico removida
  ✓ coluna reservas.origem_reserva removida
  ✓ coluna reservas.contato_id removida
  ✓ coluna reservas.observacoes removida
  ✓ coluna reservas.atendente removida
  ✓ tabelas originais preservadas (edicoes, mesas, reservas, site_config)
  ✓ gatilho e função removidos
  ✓ índice único original de reservas preservado
  ✓ migração reaplica limpa depois da reversão
RESULTADO: 101 verificações ok, 0 falhas
```
