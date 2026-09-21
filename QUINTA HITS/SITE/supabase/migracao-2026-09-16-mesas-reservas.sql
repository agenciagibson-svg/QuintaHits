-- QUINTA HITS — migração 16/09/2026: mapa de mesas e reservas pelo site
-- Rode no Supabase: SQL Editor → New query → colar → Run. Pode rodar mais de uma vez.

create extension if not exists pgcrypto;

-- ========== TABELA: mesas ==========
-- O mapa da casa. x/y = posição do centro da mesa no mapa, em % (0 a 100).
create table if not exists mesas (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  lugares int not null,
  area text not null default '',
  x numeric not null default 50,
  y numeric not null default 50,
  ativa boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint mesas_numero_unico unique (numero),
  constraint mesas_lugares_valido check (lugares between 1 and 50),
  constraint mesas_posicao_valida check (x between 0 and 100 and y between 0 and 100)
);

-- ========== TABELA: reservas ==========
-- Pedido feito pelo site. Nasce 'pendente' e a equipe confirma ou recusa no painel.
create table if not exists reservas (
  id uuid primary key default gen_random_uuid(),
  edicao_id text not null references edicoes(id) on delete restrict,
  mesa_id uuid not null references mesas(id) on delete restrict,
  nome text not null,
  whatsapp text not null,           -- só dígitos, com DDD
  pessoas int not null,
  status text not null default 'pendente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservas_status_valido check (status in ('pendente', 'confirmada', 'recusada', 'cancelada')),
  constraint reservas_pessoas_valido check (pessoas between 1 and 50)
);

-- Uma mesa só pode ter UM pedido ativo (pendente ou confirmado) por edição.
-- É o banco que impede duas pessoas reservarem a mesma mesa ao mesmo tempo.
create unique index if not exists reservas_mesa_ocupada
  on reservas (edicao_id, mesa_id)
  where status in ('pendente', 'confirmada');

create index if not exists reservas_edicao on reservas (edicao_id);

-- ========== SEGURANÇA ==========
-- Mesmo modelo das outras tabelas: RLS ligado e sem policies. Só o servidor (service_role) lê e escreve;
-- o navegador nunca acessa o banco direto — nome e WhatsApp dos clientes não ficam expostos.
alter table mesas enable row level security;
alter table reservas enable row level security;
