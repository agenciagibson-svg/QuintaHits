-- QUINTA HITS — migração (21/10/2026): proteções da revisão de segurança.
--
-- ADITIVA e idempotente. Pode rodar antes ou depois do deploy (o site novo funciona sem ela, só sem estas proteções).
--   1. login_tentativas: limite de senha errada POR E-MAIL, valendo para todas as instâncias do servidor (antes era só
--      em memória, por endereço de IP): 5 erros = bloqueio crescente (15 min, 30, 60... até 24 h);
--   2. sessoes_encerradas: "Sair" passa a invalidar o cookie no servidor (antes só apagava no navegador);
--   3. reservas.origem_ip_hash: impressão (hash com segredo, sem o IP) de quem fez o pedido pelo site, para limitar
--      quantos pedidos abertos um mesmo endereço segura numa noite.
-- Reversão: reverter-2026-10-21-seguranca.sql.

create table if not exists login_tentativas (
  chave text primary key,                    -- hash do e-mail (nunca o e-mail em claro)
  falhas int not null default 0,
  bloqueado_ate timestamptz,
  atualizado_em timestamptz not null default now()
);

create table if not exists sessoes_encerradas (
  assinatura_hash text primary key,          -- hash da assinatura do cookie encerrado
  expira_em timestamptz not null             -- depois disso o cookie já não valeria: a linha pode ser apagada
);
create index if not exists sessoes_encerradas_expira on sessoes_encerradas (expira_em);

alter table reservas add column if not exists origem_ip_hash text;
create index if not exists reservas_ip_noite on reservas (edicao_id, origem_ip_hash) where origem_ip_hash is not null;

-- Mesmo modelo das demais tabelas: RLS ligado, sem policies, só o servidor (service_role) acessa.
alter table login_tentativas enable row level security;
alter table sessoes_encerradas enable row level security;
revoke all on table login_tentativas from anon, authenticated;
revoke all on table sessoes_encerradas from anon, authenticated;
