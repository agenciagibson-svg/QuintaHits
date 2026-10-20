-- QUINTA HITS — migração (20/10/2026): mais de uma casa no mesmo sistema (Quinta Hits/Florindos + Harley Grill).
--
-- O que muda:
--   1. tabela nova `casas` (uma linha por casa; a planta de fundo de cada casa que não é a Quinta Hits mora aqui);
--   2. coluna `casa` em `edicoes` e em `mesas`, com padrão 'quinta-hits' — TUDO o que já existe continua sendo da
--      Quinta Hits, sem mexer em nenhuma linha;
--   3. o número da mesa passa a ser único POR CASA (antes era único no sistema todo);
--   4. o id da edição segue o formato de cada casa: Quinta Hits = 'AAAA-MM-DD' (como sempre); outras casas =
--      'AAAA-MM-DD_<casa>' (ex.: '2026-10-24_harley-grill'). O começo continua sendo a data, então as comparações
--      por data (de hoje em diante, já passou) seguem valendo;
--   5. o banco recusa reserva (ou canal de mesa) que junte mesa de uma casa com edição de outra.
--
-- Idempotente (pode rodar de novo). Não apaga nem altera dado. Reversão: reverter-2026-10-20-multi-casa.sql.
-- ORDEM: rode ESTA migração, publique o site novo e só então rode seed-2026-10-20-harley-grill-mesas.sql
-- (o site antigo não filtra por casa: com as mesas do Harley já cadastradas, ele as mostraria no mapa da Quinta Hits).

create table if not exists casas (
  id text primary key,
  nome text not null,
  planta jsonb,                                   -- elementos desenhados por cima do mapa (palco, bar...); opcional
  updated_at timestamptz not null default now(),
  constraint casas_id_valido check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 40)
);
comment on table casas is 'Casas atendidas pelo sistema de reservas. A Quinta Hits (Florindos Bar) segue usando site_config.';

insert into casas (id, nome) values ('quinta-hits', 'QUINTA HITS · Florindos Bar') on conflict (id) do nothing;
insert into casas (id, nome) values ('harley-grill', 'Harley Grill') on conflict (id) do nothing;

alter table edicoes add column if not exists casa text not null default 'quinta-hits';
alter table mesas add column if not exists casa text not null default 'quinta-hits';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'edicoes_casa_fk') then
    alter table edicoes add constraint edicoes_casa_fk foreign key (casa) references casas(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mesas_casa_fk') then
    alter table mesas add constraint mesas_casa_fk foreign key (casa) references casas(id) on delete restrict;
  end if;

  -- Número da mesa: único dentro da casa (a mesa 7 da Quinta Hits e a mesa 7 do Harley podem existir juntas).
  if not exists (select 1 from pg_constraint where conname = 'mesas_numero_unico_por_casa') then
    alter table mesas add constraint mesas_numero_unico_por_casa unique (casa, numero);
  end if;
  alter table mesas drop constraint if exists mesas_numero_unico;

  -- Formato do id da edição por casa. NOT VALID: vale para toda edição criada ou alterada daqui em diante, sem
  -- reprocessar as antigas (todas da Quinta Hits, já no formato 'AAAA-MM-DD').
  if not exists (select 1 from pg_constraint where conname = 'edicoes_id_da_casa') then
    alter table edicoes add constraint edicoes_id_da_casa check (
      (casa = 'quinta-hits' and id = data::text) or (casa <> 'quinta-hits' and id = data::text || '_' || casa)
    ) not valid;
  end if;
end $$;

create index if not exists edicoes_casa_data on edicoes (casa, data);
create index if not exists mesas_casa on mesas (casa);

-- Mesa e edição precisam ser da mesma casa (reserva e canais por edição).
create or replace function casas_mesa_e_edicao_da_mesma_casa() returns trigger
language plpgsql as $$
declare
  casa_mesa text;
  casa_edicao text;
begin
  select casa into casa_mesa from mesas where id = new.mesa_id;
  select casa into casa_edicao from edicoes where id = new.edicao_id;
  -- Mesa ou edição inexistente: quem responde é a chave estrangeira (erro de sempre, 23503).
  if casa_mesa is not null and casa_edicao is not null and casa_mesa <> casa_edicao then
    raise exception 'A mesa e a edição são de casas diferentes.' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists reservas_mesma_casa_trg on reservas;
create trigger reservas_mesma_casa_trg
  before insert or update of mesa_id, edicao_id on reservas
  for each row execute function casas_mesa_e_edicao_da_mesma_casa();

-- `edicoes_mesas` vem da migração do agente (21/09); banco sem ela só não ganha este gatilho.
do $$
begin
  if to_regclass('public.edicoes_mesas') is not null then
    drop trigger if exists edicoes_mesas_mesma_casa_trg on edicoes_mesas;
    create trigger edicoes_mesas_mesma_casa_trg
      before insert or update of mesa_id, edicao_id on edicoes_mesas
      for each row execute function casas_mesa_e_edicao_da_mesma_casa();
  end if;
end $$;

comment on column edicoes.casa is 'Casa da edição. Quinta Hits: id = data. Outras casas: id = data_casa.';
comment on column mesas.casa is 'Casa a que a mesa pertence. O número é único dentro da casa.';

-- Mesmo modelo de segurança das demais tabelas: RLS ligado, sem policies, só a service_role (servidor) acessa.
alter table casas enable row level security;
revoke all on table casas from anon, authenticated;
revoke all on function casas_mesa_e_edicao_da_mesma_casa() from public, anon, authenticated;
