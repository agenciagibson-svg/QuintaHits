-- QUINTA HITS — migração (22/10/2026): usuários do painel e do app da casa cadastrados pelo próprio painel.
--
-- ADITIVA e idempotente. Antes, quem entra era definido só pelas variáveis da Vercel (ADMIN_EMAILS, CASA_EMAILS...);
-- elas continuam valendo (são as contas FIXAS, do dono: não dá para remover pelo painel, então ninguém se tranca fora).
-- Esta tabela soma as contas criadas no painel (Configuração → Usuários):
--   painel = true  → entra no painel e no app de reservas de todas as casas;
--   casas          → entra só no app de reservas (PWA), vendo só essas casas.
-- A senha fica no Supabase Auth (nunca aqui). Rode ANTES ou DEPOIS do deploy: sem a tabela, só as contas fixas entram.

create table if not exists usuarios_acesso (
  email text primary key,
  nome text not null default '',
  painel boolean not null default false,
  casas text[] not null default '{}',
  ativo boolean not null default true,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint usuarios_acesso_email_valido check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 320),
  constraint usuarios_acesso_nome_curto check (char_length(nome) <= 80)
);

-- Mesmo modelo das demais tabelas: RLS ligado, sem policies, só o servidor (service_role) acessa.
alter table usuarios_acesso enable row level security;
revoke all on table usuarios_acesso from anon, authenticated;
