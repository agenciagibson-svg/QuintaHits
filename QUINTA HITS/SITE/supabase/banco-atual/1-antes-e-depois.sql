-- QUINTA HITS — foto do banco ATUAL (somente leitura). Rode ANTES e DEPOIS da migração e compare.
--
-- Não altera nada. Mostra: (1) se o banco tem o que a migração exige; (2) contagens; (3) uma "impressão digital"
-- (hash) do conteúdo das tabelas que a migração NÃO pode mexer. Se as impressões digitais forem iguais antes e depois,
-- nenhum dado existente foi alterado. (Se entrar uma reserva nova entre as duas rodadas, a de `reservas` muda:
-- nesse caso confira as contagens.)
--
-- Não contém segredos: só contagens e hashes. Pode colar o resultado no chat.

select item, valor
from (
  select 1 as ordem, 'PRÉ-REQUISITO: tabela ' || t as item,
         case when to_regclass('public.' || t) is not null then 'OK' else 'FALTA' end as valor
  from (values ('edicoes'), ('mesas'), ('reservas'), ('site_config')) v(t)
  union all
  select 2, 'PRÉ-REQUISITO: reservas.' || c,
         case when exists (select 1 from information_schema.columns
                           where table_schema = 'public' and table_name = 'reservas' and column_name = c)
              then 'OK' else 'FALTA' end
  from (values ('codigo'), ('expira_em'), ('confirmada_em')) v(c)
  union all
  select 2, 'PRÉ-REQUISITO: índice único reservas_mesa_ocupada',
         case when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'reservas_mesa_ocupada')
              then 'OK' else 'FALTA' end
  union all
  select 3, 'contagem: edicoes', (select count(*)::text from edicoes)
  union all
  select 3, 'contagem: mesas', (select count(*)::text from mesas)
  union all
  select 3, 'contagem: reservas', (select count(*)::text from reservas)
  union all
  select 3, 'contagem: site_config', (select count(*)::text from site_config)
  union all
  select 4, 'impressão digital: edicoes', coalesce((select md5(string_agg(e::text, '|' order by e.id)) from edicoes e), 'vazio')
  union all
  select 4, 'impressão digital: mesas', coalesce((select md5(string_agg(m::text, '|' order by m.id)) from mesas m), 'vazio')
  union all
  select 4, 'impressão digital: site_config', coalesce((select md5(string_agg(s::text, '|' order by s.id)) from site_config s), 'vazio')
  union all
  -- só as colunas que já existem hoje: as 4 novas não entram na comparação
  select 4, 'impressão digital: reservas',
         coalesce((select md5(string_agg((r.id, r.edicao_id, r.mesa_id, r.nome, r.whatsapp, r.pessoas, r.status, r.codigo, r.expira_em, r.confirmada_em, r.created_at, r.updated_at)::text, '|' order by r.id)) from reservas r), 'vazio')
) foto
order by ordem, item;
