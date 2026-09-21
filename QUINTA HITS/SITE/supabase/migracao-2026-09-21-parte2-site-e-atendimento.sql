-- QUINTA HITS — migração PARTE 2 (21/09/2026): habilitação explícita da edição para o SITE e complementos do atendimento humano.
--
-- Pré-requisito: a migração da parte 1 (migracao-2026-09-21-agente-whatsapp.sql) já aplicada.
-- ADITIVA e idempotente (pode rodar mais de uma vez): não altera nem remove nada que já exista, não apaga dados,
-- não cria mesas nem edições. Reversão: reverter-2026-09-21-parte2-site-e-atendimento.sql.
--
-- O que acrescenta:
--   1. edicoes_regras.reservas_site  — liberação EXPLÍCITA da edição para reservas pelo site (padrão FALSE).
--      Sem ela marcada, o site não aceita reserva da edição, mesmo com todas as regras preenchidas.
--   2. wa_notas_internas             — notas internas da equipe sobre um atendimento (nunca vão para o cliente).
--   3. wa_transferencias.lida_ate    — até quando a equipe já viu as mensagens do cliente (indicador de não lidas).

alter table edicoes_regras add column if not exists reservas_site boolean not null default false;
comment on column edicoes_regras.reservas_site is 'Liberação explícita da edição para reservas pelo site (padrão false). Além disso exige regras completas e ao menos uma mesa oferecida ao site.';

alter table wa_transferencias add column if not exists lida_ate timestamptz;
comment on column wa_transferencias.lida_ate is 'Mensagens do cliente recebidas até este instante já foram vistas pela equipe; NULL = nenhuma vista.';

create table if not exists wa_notas_internas (
  id uuid primary key default gen_random_uuid(),
  transferencia_id uuid not null references wa_transferencias(id) on delete cascade,
  conversa_id uuid not null references wa_conversas(id) on delete cascade,
  autor text not null,                    -- e-mail de quem escreveu (login do painel)
  texto text not null,
  criada_em timestamptz not null default now(),
  constraint wa_notas_internas_texto_valido check (char_length(texto) between 1 and 1000)
);
create index if not exists wa_notas_internas_por_transferencia on wa_notas_internas (transferencia_id, criada_em);
-- Retenção: o texto das notas segue o prazo do conteúdo das mensagens (varredura por data de criação).
create index if not exists wa_notas_internas_por_data on wa_notas_internas (criada_em);

-- Mesmo modelo de segurança das demais tabelas do agente: RLS ligado, sem policies, sem acesso de anon/authenticated.
alter table wa_notas_internas enable row level security;
revoke all on table wa_notas_internas from anon, authenticated;
