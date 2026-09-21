-- QUINTA HITS — APLICAR NO BANCO ATUAL (autorizado em 21/09/2026: migração SEM seed, banco marcado como homologação).
--
-- Cole ESTE arquivo inteiro no SQL Editor do Supabase e clique em Run. Faça isto FORA de quinta-feira à noite.
-- Antes: rode 1-antes-e-depois.sql e guarde o resultado. Depois: rode 1-antes-e-depois.sql de novo e 3-verificar.sql.
--
-- Este arquivo é a migração `migracao-2026-09-21-agente-whatsapp.sql` (cópia exata, gerada por concatenação)
-- seguida de UMA linha que marca o banco como "homologacao" durante os testes.
-- É aditivo e pode rodar mais de uma vez. NÃO cria mesas nem edições de teste (não há seed).
-- Se aparecer qualquer erro, PARE e me mande a mensagem: rode 1-antes-e-depois.sql para conferir o que ficou.
-- Reversão (se algo der errado): reverter-2026-09-21-agente-whatsapp.sql, que recusa rodar se houver reserva do agente.

-- ================= INÍCIO DA MIGRAÇÃO (cópia de migracao-2026-09-21-agente-whatsapp.sql) =================

-- QUINTA HITS — migração 21/09/2026: agente de reservas pelo WhatsApp (fase 1, sem IA)
--
-- *** NÃO RODAR EM PRODUÇÃO SEM AUTORIZAÇÃO EXPRESSA. Rode primeiro no projeto de HOMOLOGAÇÃO. ***
--
-- Pré-requisito: schema.sql já aplicado (edicoes, mesas, reservas com codigo/expira_em/confirmada_em).
-- Pode rodar mais de uma vez (idempotente). Reversão: reverter-2026-09-21-agente-whatsapp.sql.
-- Documentação e motivo de cada parte: DOCS/AGENTE_RESERVAS_QUINTA_HITS.md (seções 21 e 22).
--
-- Só ADICIONA: 12 tabelas novas + 4 colunas, 1 constraint, 1 índice e 1 gatilho em `reservas`.
-- Não altera nem apaga dado, coluna, índice ou constraint existente. Sem views e sem funções chamáveis
-- pela API (o Supabase expõe ambas ao navegador; aqui o acesso é só pelo servidor, com service_role).

-- ===================== 1. CONFIGURAÇÃO GLOBAL DO AGENTE =====================
-- Linha única. Os interruptores daqui valem JUNTO com as variáveis de ambiente (vale o mais restritivo).
-- Tudo nasce DESLIGADO e restrito a números de teste (lista vazia = ninguém recebe resposta do agente).
create table if not exists wa_config (
  id int primary key default 1,
  ambiente text not null default 'producao',              -- 'homologacao' habilita o seed fictício
  agente_ativo boolean not null default false,
  envio_ativo boolean not null default false,
  transferencia_humana_ativa boolean not null default true,
  pausa_emergencia boolean not null default false,        -- para o agente e todo envio, na hora
  restringir_a_numeros_teste boolean not null default true,
  numeros_teste text[] not null default '{}',             -- wa_id (só dígitos, com 55) autorizados a testar
  limite_entradas_por_contato_hora int not null default 30,  -- proteção técnica, ajustável
  limite_saidas_por_contato_hora int not null default 20,    -- proteção técnica, ajustável
  textos jsonb not null default '{}'::jsonb,              -- substituições opcionais das respostas padrão
  -- Política de retenção (LGPD). Valores INICIAIS definidos pelo responsável em 21/09/2026, configuráveis.
  -- PENDENTE de validação administrativa e jurídica antes da produção (politica_retencao_validada_em).
  retencao_conteudo_mensagens_dias int not null default 90,         -- texto integral das mensagens
  retencao_metadados_meses int not null default 12,                 -- metadados técnicos e status de entrega
  retencao_logs_erro_dias int not null default 90,                  -- detalhe de erro (o código do erro fica com os metadados)
  retencao_eventos_webhook_dias int not null default 30,            -- eventos processados (idempotência)
  anonimizar_conversas_encerradas_meses int not null default 12,
  retencao_reservas_meses int not null default 24,                  -- depois disso a reserva é anonimizada, não apagada
  limpeza_ativa boolean not null default false,                     -- a rotina de limpeza nasce DESLIGADA
  politica_retencao_validada_em timestamptz,                        -- NULL = política ainda não validada
  updated_at timestamptz not null default now(),
  constraint wa_config_singleton check (id = 1),
  constraint wa_config_ambiente_valido check (ambiente in ('producao', 'homologacao')),
  constraint wa_config_retencao_valida check (
    retencao_conteudo_mensagens_dias > 0 and retencao_metadados_meses > 0 and retencao_logs_erro_dias > 0
    and retencao_eventos_webhook_dias > 0 and anonimizar_conversas_encerradas_meses > 0 and retencao_reservas_meses > 0),
  constraint wa_config_limites_validos check (limite_entradas_por_contato_hora > 0 and limite_saidas_por_contato_hora > 0)
);
insert into wa_config (id) values (1) on conflict (id) do nothing;

-- ===================== 2. REGRAS POR EDIÇÃO (configuráveis no painel) =====================
-- Coluna vazia (NULL) = "ainda não definido". Nenhum valor padrão: o agente nunca inventa regra.
create table if not exists edicoes_regras (
  edicao_id text primary key references edicoes(id) on delete cascade,
  abertura text,                          -- horário de abertura da casa: "19h" ou "19h30"
  reservas_ate timestamptz,               -- prazo final para reservar
  tolerancia_min int,                     -- minutos de tolerância na chegada
  cancelamento_ate_horas int,             -- cancelar até X horas antes do início
  capacidade_maxima int,                  -- pessoas na casa nesta edição
  consumacao_minima_centavos int,         -- 0 = sem consumação; NULL = não definido
  preco_centavos int,
  sinal_centavos int,                     -- só informativo: pagamento segue DESLIGADO na fase 1
  instrucoes_chegada text,
  atendimento_automatico boolean not null default false,  -- liberação explícita da edição para o agente
  observacoes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint edicoes_regras_abertura_valida check (abertura is null or abertura ~ '^([01]?[0-9]|2[0-3])h([0-5][0-9])?$'),
  constraint edicoes_regras_numeros_validos check (
    (tolerancia_min is null or tolerancia_min >= 0)
    and (cancelamento_ate_horas is null or cancelamento_ate_horas >= 0)
    and (capacidade_maxima is null or capacidade_maxima > 0)
    and (consumacao_minima_centavos is null or consumacao_minima_centavos >= 0)
    and (preco_centavos is null or preco_centavos >= 0)
    and (sinal_centavos is null or sinal_centavos >= 0)
  )
);

-- Em que CANAIS cada mesa pode ser oferecida numa edição. NÃO é um estoque: o estoque é UM só
-- (`mesas` + `reservas` + índice único de reservas). Esta tabela só decide quem pode OFERECER a mesa.
--   sem linha           = padrão de hoje: site e painel oferecem; WhatsApp NÃO oferece (liberação explícita)
--   os 3 canais falsos  = "indisponível" nesta edição
-- Site, WhatsApp e painel disputam o mesmo índice: nunca há reserva dupla, mesmo com listas diferentes.
create table if not exists edicoes_mesas (
  edicao_id text not null references edicoes(id) on delete cascade,
  mesa_id uuid not null references mesas(id) on delete cascade,
  disponivel_site boolean not null default true,
  disponivel_whatsapp boolean not null default false,
  disponivel_admin boolean not null default true,
  lugares_override int,                   -- NULL = usa mesas.lugares
  created_at timestamptz not null default now(),
  primary key (edicao_id, mesa_id),
  constraint edicoes_mesas_lugares_valido check (lugares_override is null or lugares_override between 1 and 50)
);
create index if not exists edicoes_mesas_mesa on edicoes_mesas (mesa_id);

-- ===================== 3. CONTATOS, CONVERSAS E MENSAGENS =====================
create table if not exists wa_contatos (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null,                    -- como a Meta entrega: só dígitos, com país (ex.: 5534...)
  telefone text,                          -- 11 dígitos (DDD+9+8) quando brasileiro; NULL se não der para normalizar
  nome text not null default '',
  origem text not null default 'whatsapp_entrada',  -- o cliente escreveu primeiro = consentimento de atendimento
  consentimento_em timestamptz,
  primeiro_contato_em timestamptz not null default now(),
  ultima_interacao_em timestamptz not null default now(),
  observacoes text not null default '',
  bloqueado boolean not null default false,
  preferencia_atendimento text not null default 'agente',
  anonimizado_em timestamptz,             -- preenchido pela rotina de retenção / pedido de exclusão
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wa_contatos_wa_id_unico unique (wa_id),
  -- só dígitos; ou o marcador "anon-<32 hex>" de um contato anonimizado
  constraint wa_contatos_wa_id_valido check (wa_id ~ '^[0-9]{8,15}$' or wa_id ~ '^anon-[0-9a-f]{32}$'),
  constraint wa_contatos_origem_valida check (origem in ('whatsapp_entrada', 'site', 'admin', 'importado')),
  constraint wa_contatos_preferencia_valida check (preferencia_atendimento in ('agente', 'humano'))
);
create index if not exists wa_contatos_telefone on wa_contatos (telefone) where telefone is not null;

create table if not exists wa_conversas (
  id uuid primary key default gen_random_uuid(),
  contato_id uuid not null references wa_contatos(id) on delete cascade,
  status text not null default 'agente',
  estado text not null default 'NEW',
  contexto jsonb not null default '{}'::jsonb,   -- edição, pessoas, mesa, nome, observações (nunca segredos)
  versao int not null default 0,                 -- trava otimista: duas mensagens ao mesmo tempo não se atropelam
  tentativas_sem_entender smallint not null default 0,
  ultima_msg_cliente_em timestamptz,             -- a janela de 24 h conta a partir daqui
  aberta_em timestamptz not null default now(),
  encerrada_em timestamptz,
  updated_at timestamptz not null default now(),
  constraint wa_conversas_status_valido check (status in ('agente', 'aguardando_humano', 'com_humano', 'encerrada')),
  constraint wa_conversas_estado_valido check (estado in (
    'NEW', 'WELCOME', 'SELECTING_EVENT', 'ASKING_GUEST_COUNT', 'CHECKING_AVAILABILITY', 'SELECTING_TABLE',
    'COLLECTING_NAME', 'COLLECTING_NOTES', 'REVIEWING_RESERVATION', 'CONFIRMED', 'ALTERING_RESERVATION',
    'CANCELLING_RESERVATION', 'WAITING_HUMAN', 'CLOSED'))
);
-- No máximo uma conversa aberta por contato.
create unique index if not exists wa_conversas_uma_aberta on wa_conversas (contato_id) where status <> 'encerrada';
-- Fila do painel: aguardando humano / com humano.
create index if not exists wa_conversas_fila on wa_conversas (status, updated_at) where status in ('aguardando_humano', 'com_humano');
-- Rotina de retenção: conversas encerradas há mais de X meses.
create index if not exists wa_conversas_encerradas on wa_conversas (encerrada_em) where status = 'encerrada';

create table if not exists wa_transferencias (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references wa_conversas(id) on delete cascade,
  motivo text not null,
  detalhe text not null default '',
  status text not null default 'aguardando',
  atendente text,                         -- e-mail de quem assumiu (login do painel)
  criada_em timestamptz not null default now(),
  assumida_em timestamptz,
  devolvida_em timestamptz,               -- devolvida ao agente
  encerrada_em timestamptz,               -- resolvida pelo atendente
  constraint wa_transferencias_motivo_valido check (motivo in (
    'pedido_do_cliente', 'reclamacao', 'disponibilidade_indefinida', 'edicao_nao_pronta', 'nao_entendeu',
    'fora_do_fluxo', 'erro_tecnico', 'excecao_de_reserva', 'pagamento_ou_estorno', 'numero_nao_brasileiro', 'outro')),
  constraint wa_transferencias_status_valido check (status in ('aguardando', 'assumida', 'devolvida', 'encerrada'))
);
-- Uma transferência aberta por conversa (evita fila duplicada).
create unique index if not exists wa_transferencias_uma_aberta on wa_transferencias (conversa_id) where status in ('aguardando', 'assumida');
create index if not exists wa_transferencias_pendentes on wa_transferencias (criada_em) where status = 'aguardando';

create table if not exists wa_mensagens (
  id uuid primary key default gen_random_uuid(),
  wamid text,                             -- id da Meta; NULL só enquanto a saída ainda não foi enviada
  conversa_id uuid not null references wa_conversas(id) on delete cascade,
  direcao text not null,
  autor text not null,
  tipo text not null default 'text',
  conteudo text not null default '',
  status text not null,
  erro_codigo text,
  erro_detalhe text,                      -- sanitizado: sem token, sem telefone
  criada_em timestamptz not null default now(),
  conteudo_removido_em timestamptz,       -- retenção: o texto sai aos X dias; a linha (metadados) fica mais tempo
  constraint wa_mensagens_wamid_unico unique (wamid),
  constraint wa_mensagens_direcao_valida check (direcao in ('entrada', 'saida')),
  constraint wa_mensagens_autor_valido check (autor in ('cliente', 'agente', 'atendente', 'sistema')),
  constraint wa_mensagens_status_valido check (status in ('recebida', 'na_fila', 'enviada', 'entregue', 'lida', 'falhou')),
  constraint wa_mensagens_tamanho_valido check (char_length(conteudo) <= 4096)
);
create index if not exists wa_mensagens_conversa on wa_mensagens (conversa_id, criada_em);
-- Rotina de retenção varre por data de criação.
create index if not exists wa_mensagens_criada on wa_mensagens (criada_em);

-- ===================== 4. IDEMPOTÊNCIA DO WEBHOOK =====================
-- Só guarda o necessário para não processar duas vezes e para auditar o roteamento por número.
-- SEM conteúdo e SEM telefone do remetente: é o registro sanitizado dos eventos de outros números.
create table if not exists wa_webhook_eventos (
  id text primary key,                    -- wamid (mensagem) ou "wamid:status" (atualização de status)
  tipo text not null,
  phone_number_id text,
  destino text not null,
  recebido_em timestamptz not null default now(),
  constraint wa_webhook_eventos_destino_valido check (destino in (
    'quinta_hits', 'ignorado_outro_numero', 'ignorado_sem_numero', 'ignorado_tipo'))
);
create index if not exists wa_webhook_eventos_recebido on wa_webhook_eventos (recebido_em);

-- ===================== 5. FILA DE SAÍDA E TENTATIVAS =====================
create table if not exists wa_fila_saida (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid references wa_conversas(id) on delete cascade,
  mensagem_id uuid references wa_mensagens(id) on delete set null,
  para text not null,                     -- wa_id de destino
  tipo text not null,
  payload jsonb not null,
  status text not null default 'pendente',
  tentativas int not null default 0,
  max_tentativas int not null default 5,
  proxima_tentativa_em timestamptz not null default now(),
  travado_ate timestamptz,                -- "reserva" do item por um processador (compara-e-troca, sem RPC)
  chave_idempotencia text not null,
  erro_codigo text,
  erro_detalhe text,
  criada_em timestamptz not null default now(),
  enviada_em timestamptz,
  updated_at timestamptz not null default now(),
  constraint wa_fila_saida_chave_unica unique (chave_idempotencia),
  constraint wa_fila_saida_tipo_valido check (tipo in ('texto', 'interativo', 'template')),
  constraint wa_fila_saida_status_valido check (status in ('pendente', 'enviando', 'enviada', 'falhou', 'morta', 'cancelada')),
  constraint wa_fila_saida_tentativas_validas check (tentativas >= 0 and max_tentativas > 0)
);
create index if not exists wa_fila_saida_pendentes on wa_fila_saida (proxima_tentativa_em) where status in ('pendente', 'enviando');

create table if not exists wa_fila_tentativas (
  id bigint generated always as identity primary key,
  fila_id uuid not null references wa_fila_saida(id) on delete cascade,
  numero int not null,
  http_status int,
  erro_codigo text,
  erro_detalhe text,                      -- sanitizado
  duracao_ms int,
  criada_em timestamptz not null default now()
);
create index if not exists wa_fila_tentativas_fila on wa_fila_tentativas (fila_id, numero);

-- ===================== 6. AUDITORIA E HISTÓRICO DE RESERVAS =====================
create table if not exists auditoria (
  id bigint generated always as identity primary key,
  ator text not null,                     -- 'agente', 'sistema', 'atendente:<email>', 'admin:<email>'
  acao text not null,
  entidade text not null,
  entidade_id text,
  detalhe jsonb not null default '{}'::jsonb,   -- sanitizado: nunca segredos
  criado_em timestamptz not null default now()
);
create index if not exists auditoria_entidade on auditoria (entidade, entidade_id);
create index if not exists auditoria_criado on auditoria (criado_em);

create table if not exists reservas_historico (
  id bigint generated always as identity primary key,
  reserva_id uuid not null references reservas(id) on delete cascade,
  status_anterior text,
  status_novo text not null,
  origem_reserva text,
  criado_em timestamptz not null default now()
);
create index if not exists reservas_historico_reserva on reservas_historico (reserva_id, criado_em);

-- ===================== 7. MUDANÇAS EM `reservas` (todas aditivas) =====================
-- Colunas com valor padrão constante: o Postgres 11+ não reescreve a tabela.
-- Todas as reservas atuais (site e confirmação à mão) ficam com origem_reserva = 'site'.
alter table reservas add column if not exists origem_reserva text not null default 'site';
alter table reservas add column if not exists contato_id uuid references wa_contatos(id) on delete set null;
alter table reservas add column if not exists observacoes text not null default '';
alter table reservas add column if not exists atendente text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservas_origem_valida') then
    alter table reservas add constraint reservas_origem_valida
      check (origem_reserva in ('site', 'whatsapp_agent', 'admin', 'manual'));
  end if;
end $$;

create index if not exists reservas_contato on reservas (contato_id) where contato_id is not null;

-- Histórico automático de mudança de status: cobre o fluxo do site, o webhook atual e o painel
-- sem tocar no código deles. O ator detalhado vai em `auditoria`, gravada pela aplicação.
create or replace function wa_registrar_historico_reserva() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into reservas_historico (reserva_id, status_anterior, status_novo, origem_reserva)
    values (new.id, null, new.status, new.origem_reserva);
  elsif new.status is distinct from old.status then
    insert into reservas_historico (reserva_id, status_anterior, status_novo, origem_reserva)
    values (new.id, old.status, new.status, new.origem_reserva);
  end if;
  return new;
end $$;

drop trigger if exists reservas_historico_trg on reservas;
create trigger reservas_historico_trg
  after insert or update of status on reservas
  for each row execute function wa_registrar_historico_reserva();

-- ===================== 8. SEGURANÇA =====================
-- Mesmo modelo das tabelas atuais: RLS ligado e SEM policies (só a service_role, no servidor, lê e escreve).
-- Reforço: retira também as permissões de tabela de anon e authenticated.
alter table wa_config enable row level security;
alter table edicoes_regras enable row level security;
alter table edicoes_mesas enable row level security;
alter table wa_contatos enable row level security;
alter table wa_conversas enable row level security;
alter table wa_transferencias enable row level security;
alter table wa_mensagens enable row level security;
alter table wa_webhook_eventos enable row level security;
alter table wa_fila_saida enable row level security;
alter table wa_fila_tentativas enable row level security;
alter table auditoria enable row level security;
alter table reservas_historico enable row level security;

revoke all on table wa_config, edicoes_regras, edicoes_mesas, wa_contatos, wa_conversas, wa_transferencias,
  wa_mensagens, wa_webhook_eventos, wa_fila_saida, wa_fila_tentativas, auditoria, reservas_historico
  from anon, authenticated;
revoke all on function wa_registrar_historico_reserva() from public, anon, authenticated;

-- ================= FIM DA MIGRAÇÃO =================

-- Marca o banco como homologação enquanto testamos. No lançamento volta para 'producao' com:
--   update wa_config set ambiente = 'producao', numeros_teste = '{}', updated_at = now() where id = 1;
update wa_config set ambiente = 'homologacao', updated_at = now() where id = 1;
