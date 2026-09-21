-- QUINTA HITS — schema do banco para o painel admin
-- Rode este arquivo inteiro no Supabase: Project → SQL Editor → New query → colar → Run

-- ========== TABELA: edicoes ==========
-- Uma linha por edição (quinta-feira). Espelha o antigo src/data/programacao.json.
create table if not exists edicoes (
  id text primary key,               -- formato YYYY-MM-DD (mesmo valor de "data")
  data date not null,
  artista text not null default '',
  instagram text not null default '',
  tema text not null default '',
  genero text not null default '',   -- rock | pop-rock | hits | 2000s | dj | mpb | special | ''
  horario text not null default '',
  local text not null default '',
  status text not null default 'a_confirmar', -- realizada | confirmada | a_confirmar | cancelada
  destaque text not null default '',
  updated_at timestamptz not null default now(),
  constraint edicoes_genero_valido check (genero in ('', 'rock', 'pop-rock', 'hits', '2000s', 'dj', 'mpb', 'special')),
  constraint edicoes_status_valido check (status in ('realizada', 'confirmada', 'a_confirmar', 'cancelada'))
);

-- ========== TABELA: site_config ==========
-- Linha única (id fixo = 1) com os campos editáveis do site que hoje ficam hard-coded
-- em src/config/site.ts (endereço/bairro/instagram da casa, link de reserva, horário).
create table if not exists site_config (
  id int primary key default 1,
  casa_endereco text not null default '',
  casa_bairro text not null default '',
  casa_instagram text not null default '',
  reserva_url text not null default '',
  horario_padrao text not null default '',
  updated_at timestamptz not null default now(),
  constraint site_config_singleton check (id = 1)
);

insert into site_config (id) values (1) on conflict (id) do nothing;

-- ========== SEGURANÇA ==========
-- RLS ligado e SEM policies: só a service_role key (usada apenas no servidor,
-- nunca no navegador) consegue ler ou escrever. O site público lê via API routes
-- do Next.js, que rodam no servidor — não há acesso direto do browser ao banco.
alter table edicoes enable row level security;
alter table site_config enable row level security;

-- ========== SEED — agenda de 15/09/2026 (DEC-013, DEC-014, DEC-016) ==========
-- Quinta sem edição precisa de registro 'cancelada'; sem registro, o site cria um card "line-up em breve".
insert into edicoes (id, data, artista, instagram, tema, genero, horario, local, status, destaque) values
('2026-08-27', '2026-08-27', 'Jhean Marcell', 'jheanmarcell', '', '2000s', '', 'Tatu Bola', 'realizada', ''),
('2026-09-10', '2026-09-10', 'NETO FOG', 'netofog', 'Quinta Hits Pop Rock', 'pop-rock', '', 'Tatu Bola', 'realizada', ''),
('2026-09-17', '2026-09-17', '', '', '', '', '', 'Florindos Bar', 'cancelada', 'Sem edição nesta data — não existe quinta em 17/09/2026'),
('2026-09-24', '2026-09-24', 'Jhean Marcell', 'jheanmarcell', '', '2000s', '', 'Florindos Bar', 'confirmada', ''),
('2026-10-01', '2026-10-01', 'Jhean Marcell e DJ Leona', 'jheanmarcell', '', '2000s', '', 'Florindos Bar', 'confirmada', ''),
('2026-10-08', '2026-10-08', 'Cibele e DJ Jabá', 'dj.jabba', '', 'dj', '', 'Florindos Bar', 'confirmada', 'Cibele em voz e violão'),
('2026-10-15', '2026-10-15', 'Voo Livre e DJ Leona', 'oficialgrupovoolivre', 'Tributo ao Roupa Nova', 'hits', '', 'Florindos Bar', 'confirmada', ''),
('2026-10-22', '2026-10-22', 'Jay-C e DJ Leona', 'oficialjayc', '', 'pop-rock', '', 'Florindos Bar', 'confirmada', ''),
('2026-10-29', '2026-10-29', 'Jhean Marcell e DJ Leona', 'jheanmarcell', '', '2000s', '', 'Florindos Bar', 'confirmada', ''),
('2026-11-05', '2026-11-05', 'Cibele e DJ Jabá', 'dj.jabba', '', 'dj', '', 'Florindos Bar', 'confirmada', 'Cibele em voz e violão'),
('2026-11-12', '2026-11-12', 'NETO FOG e DJ Leona', 'netofog', '', 'pop-rock', '', 'Florindos Bar', 'confirmada', ''),
('2026-11-19', '2026-11-19', 'Jay-C e DJ Leona', 'oficialjayc', '', 'pop-rock', '', 'Florindos Bar', 'confirmada', ''),
('2026-11-26', '2026-11-26', 'Jhean Marcell e DJ Leona', 'jheanmarcell', '', '2000s', '', 'Florindos Bar', 'confirmada', '')
on conflict (id) do nothing;

update site_config set casa_endereco = 'Av. Francisco Galassi, 1551', casa_bairro = 'Morada da Colina'
where id = 1 and casa_endereco = '';

-- ========== MESAS E RESERVAS (igual a migracao-2026-09-16-mesas-reservas.sql) ==========
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

-- ========== CONFIRMAÇÃO PELO WHATSAPP (igual a migracao-2026-09-16-confirmacao-whatsapp.sql) ==========
alter table reservas add column if not exists codigo text;
alter table reservas add column if not exists expira_em timestamptz;
alter table reservas add column if not exists confirmada_em timestamptz;

-- A regra de status muda antes de converter os registros antigos (senão 'expirada' seria recusado).
alter table reservas drop constraint if exists reservas_status_valido;

-- Status antigos do fluxo manual. Pedido 'pendente' não tem código para o cliente mandar: expira e solta a mesa.
update reservas set status = 'expirada', expira_em = coalesce(expira_em, now()) where status = 'pendente';
update reservas set status = 'cancelada' where status = 'recusada';

alter table reservas alter column status set default 'aguardando';
alter table reservas add constraint reservas_status_valido
  check (status in ('aguardando', 'confirmada', 'expirada', 'cancelada'));

-- Mesa segurada = pedido aguardando mensagem ou confirmado.
drop index if exists reservas_mesa_ocupada;
create unique index reservas_mesa_ocupada
  on reservas (edicao_id, mesa_id)
  where status in ('aguardando', 'confirmada');

-- O código identifica o pedido na mensagem: não pode repetir entre pedidos aguardando.
create unique index if not exists reservas_codigo_aguardando
  on reservas (codigo)
  where status = 'aguardando';
