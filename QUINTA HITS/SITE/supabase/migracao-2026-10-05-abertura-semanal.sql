-- QUINTA HITS — migração (05/10/2026): abertura semanal das reservas pelo site (padrão da casa).
--
-- ADITIVA e idempotente: acrescenta duas colunas em site_config e grava o padrão escolhido pelo responsável
-- (segunda-feira às 12h) na primeira aplicação. Não altera nem apaga nenhum outro dado.
-- Reversão: reverter-2026-10-05-abertura-semanal.sql.
--
-- Regra: as reservas de cada edição abrem no dia da semana `reservas_abrem_dia` (0 = domingo … 6 = sábado) mais
-- recente até a data da edição, no horário `reservas_abrem_hora` ("12h" ou "12h30"), horário de Uberlândia.
-- Ex.: segunda às 12h → a quinta 08/10 abre na segunda 05/10 às 12h. Os dois vazios = sem dia fixo (comportamento
-- anterior: a edição abre assim que está completa e liberada). Dá para mudar no painel, em Configurações da casa.
-- O site funciona sem estas colunas (sem abertura semanal).

-- A linha única da casa já existe (schema.sql); garante por segurança, sem mexer em nada se existir.
insert into site_config (id) values (1) on conflict (id) do nothing;

do $$
declare
  primeira_vez boolean := not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'site_config' and column_name = 'reservas_abrem_dia'
  );
begin
  alter table site_config add column if not exists reservas_abrem_dia smallint;
  alter table site_config add column if not exists reservas_abrem_hora text;

  if not exists (select 1 from pg_constraint where conname = 'site_config_reservas_abrem_validas') then
    alter table site_config add constraint site_config_reservas_abrem_validas check (
      (reservas_abrem_dia is null and reservas_abrem_hora is null)
      or (reservas_abrem_dia is not null and reservas_abrem_hora is not null
          and reservas_abrem_dia between 0 and 6 and reservas_abrem_hora ~ '^([01]?[0-9]|2[0-3])h([0-5][0-9])?$')
    );
  end if;

  -- Padrão escolhido em 05/10/2026: segunda-feira às 12h. Só na PRIMEIRA aplicação: rodar de novo nunca desfaz
  -- o que foi escolhido depois no painel (inclusive "sem dia fixo").
  if primeira_vez then
    update site_config set reservas_abrem_dia = 1, reservas_abrem_hora = '12h' where id = 1;
  end if;
end $$;

comment on column site_config.reservas_abrem_dia is 'Dia da semana em que as reservas pelo site abrem (0 = domingo … 6 = sábado). Vazio = sem dia fixo.';
comment on column site_config.reservas_abrem_hora is 'Horário de Uberlândia em que as reservas pelo site abrem ("12h" ou "12h30").';
