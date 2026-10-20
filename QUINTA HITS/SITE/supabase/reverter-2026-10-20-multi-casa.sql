-- Reverte migracao-2026-10-20-multi-casa.sql.
--
-- ATENÇÃO: apaga as reservas, os canais, as regras, as edições e as mesas de toda casa que NÃO é a Quinta Hits
-- (ex.: Harley Grill). Exporte antes o que precisar guardar. Os dados da Quinta Hits não são tocados.
-- Antes de reverter, volte o site para a versão anterior (o site novo depende das colunas `casa`).

begin;

delete from reservas where edicao_id in (select id from edicoes where casa <> 'quinta-hits');
do $$ begin
  if to_regclass('public.edicoes_mesas') is not null then
    delete from edicoes_mesas where edicao_id in (select id from edicoes where casa <> 'quinta-hits');
  end if;
  if to_regclass('public.edicoes_regras') is not null then
    delete from edicoes_regras where edicao_id in (select id from edicoes where casa <> 'quinta-hits');
  end if;
end $$;
delete from edicoes where casa <> 'quinta-hits';
delete from mesas where casa <> 'quinta-hits';

drop trigger if exists reservas_mesma_casa_trg on reservas;
do $$ begin
  if to_regclass('public.edicoes_mesas') is not null then
    drop trigger if exists edicoes_mesas_mesma_casa_trg on edicoes_mesas;
  end if;
end $$;
drop function if exists casas_mesa_e_edicao_da_mesma_casa();

alter table edicoes drop constraint if exists edicoes_id_da_casa;
alter table mesas drop constraint if exists mesas_numero_unico_por_casa;
alter table mesas add constraint mesas_numero_unico unique (numero);

drop index if exists edicoes_casa_data;
drop index if exists mesas_casa;
alter table edicoes drop column if exists casa;
alter table mesas drop column if exists casa;
drop table if exists casas;

commit;
