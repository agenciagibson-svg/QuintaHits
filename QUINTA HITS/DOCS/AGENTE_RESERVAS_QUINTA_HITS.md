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
| Homologação | **Produção com flags desligadas + lista de números de teste** (só eles recebem resposta do agente) | Preview da Vercel tem proteção de login por padrão e a Meta não alcança a URL. Ideal: segundo projeto Supabase de homologação (decisão do responsável) |
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

## 8. Estrutura do banco (proposta — **nada foi criado**)

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
- **Risco de colisão:** o webhook é configurado **por aplicativo**. Se o outro número da GIBSON PROMOÇÕES usa o mesmo app ou a mesma WABA, salvar esta URL muda o destino dele. Confirmar antes. Se for o caso, a alternativa é assinar a WABA com URL própria (`subscribed_apps` com `override_callback_uri`) sem mexer no app inteiro. O código já ignora com 200 qualquer `phone_number_id` diferente do da QUINTA HITS.
- App em modo **Desenvolvimento**: só recebe de/para números de teste (até 5). Passar para **Ao vivo** exige política de privacidade e é decisão do responsável (seção 17).

## 13. Janela de 24 h e templates

Dentro de 24 h da última mensagem do cliente: texto livre. Fora: só template aprovado. O sistema guardará `janela_expira_em` e
**recusará** envio livre fora dela. Nada é cadastrado na Meta automaticamente. Sugestões de template (texto para o responsável
submeter, sempre citando o Florindos Bar): confirmação de reserva, lembrete do evento, alteração, cancelamento, retomada de
atendimento. Sem mensagem em massa e sem campanha.

## 14. Segurança e LGPD

- Assinatura do webhook obrigatória (já existe); segredos só no servidor; logs sem token, telefone completo nem conteúdo.
- Idempotência por `wamid`; limite por contato e pausa global de emergência; sanitização de entradas.
- Sem conteúdo de conversa por tempo indefinido: `wa_mensagens.conteudo` com data de expurgo e rotina de limpeza.
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

**Ainda pendentes:**

- Valores das regras de cada edição (horários, consumação, tolerância etc.), cadastrados por você no painel quando o módulo existir. Nenhum valor provisório será tratado como oficial.
- **Token permanente** da Cloud API (usuário do sistema com `whatsapp_business_messaging` e `whatsapp_business_management`), cadastrado direto na Vercel, fora do chat.
- Criar o **projeto Supabase de homologação** (checklist na seção 24) e a lista de **contatos de teste autorizados** (até 5).
- Auditar no painel da Meta o webhook atual do app (seção 22) — só você enxerga essa tela.
- **Prazo de retenção** das mensagens (LGPD): sem valor definido, nada é expurgado; obrigatório definir antes da produção.
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
