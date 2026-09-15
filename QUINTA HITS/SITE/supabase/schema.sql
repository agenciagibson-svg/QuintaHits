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
('2026-10-01', '2026-10-01', '', '', '', '', '', 'Florindos Bar', 'cancelada', 'Sem edição nesta data — não existe quinta em 01/10/2026'),
('2026-10-08', '2026-10-08', 'DJ Jabá', 'dj.jabba', '', 'dj', '', 'Florindos Bar', 'confirmada', ''),
('2026-10-15', '2026-10-15', 'Voo Livre', 'oficialgrupovoolivre', 'Tributo ao Roupa Nova', 'hits', '', 'Florindos Bar', 'confirmada', ''),
('2026-10-22', '2026-10-22', 'Jay-C', 'oficialjayc', '', 'pop-rock', '', 'Florindos Bar', 'confirmada', ''),
('2026-10-29', '2026-10-29', 'Jhean Marcell', 'jheanmarcell', '', '2000s', '', 'Florindos Bar', 'confirmada', ''),
('2026-11-05', '2026-11-05', 'DJ Jabá', 'dj.jabba', '', 'dj', '', 'Florindos Bar', 'confirmada', ''),
('2026-11-12', '2026-11-12', 'NETO FOG', 'netofog', '', 'pop-rock', '', 'Florindos Bar', 'confirmada', ''),
('2026-11-19', '2026-11-19', 'Jay-C', 'oficialjayc', '', 'pop-rock', '', 'Florindos Bar', 'confirmada', ''),
('2026-11-26', '2026-11-26', 'Jhean Marcell', 'jheanmarcell', '', '2000s', '', 'Florindos Bar', 'confirmada', '')
on conflict (id) do nothing;

update site_config set casa_endereco = 'Av. Francisco Galassi, 1551', casa_bairro = 'Morada da Colina'
where id = 1 and casa_endereco = '';
