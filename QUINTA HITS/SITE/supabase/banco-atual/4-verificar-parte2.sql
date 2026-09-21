-- QUINTA HITS — verificação da PARTE 2 (somente leitura). Rode DEPOIS de migracao-2026-09-21-parte2-site-e-atendimento.sql.
-- CRITÉRIO: nenhuma linha FALHA e "RESULTADO GERAL = APROVADO".
with checagens as (
  select 1 as ordem, 'Coluna edicoes_regras.reservas_site existe (boolean, não nula)' as verificacao,
         case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'edicoes_regras' and column_name = 'reservas_site' and data_type = 'boolean' and is_nullable = 'NO') then 'OK' else 'FALHA' end as resultado
  union all
  select 2, 'Nenhuma edição foi liberada para o site pela migração (todas false)',
         case when to_regclass('public.edicoes_regras') is not null and not exists (select 1 from edicoes_regras where reservas_site) then 'OK' else 'FALHA' end
  union all
  select 3, 'Coluna wa_transferencias.lida_ate existe',
         case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wa_transferencias' and column_name = 'lida_ate') then 'OK' else 'FALHA' end
  union all
  select 4, 'Tabela wa_notas_internas existe',
         case when to_regclass('public.wa_notas_internas') is not null then 'OK' else 'FALHA' end
  union all
  select 5, 'RLS ligado em wa_notas_internas',
         case when coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.wa_notas_internas')), false) then 'OK' else 'FALHA' end
  union all
  select 6, 'anon e authenticated SEM permissão em wa_notas_internas',
         case when to_regclass('public.wa_notas_internas') is not null
                   and not has_table_privilege('anon', 'public.wa_notas_internas', 'SELECT,INSERT,UPDATE,DELETE')
                   and not has_table_privilege('authenticated', 'public.wa_notas_internas', 'SELECT,INSERT,UPDATE,DELETE')
              then 'OK' else 'FALHA' end
  union all
  select 7, 'Nenhuma policy em wa_notas_internas',
         case when not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wa_notas_internas') then 'OK' else 'FALHA' end
  union all
  select 8, 'Parte 1 intacta (12 tabelas do agente ainda existem)',
         case when (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('wa_config','edicoes_regras','edicoes_mesas','wa_contatos','wa_conversas','wa_transferencias','wa_mensagens','wa_webhook_eventos','wa_fila_saida','wa_fila_tentativas','auditoria','reservas_historico')) = 12 then 'OK' else 'FALHA' end
)
select verificacao, resultado from (
  select ordem, verificacao, resultado from checagens
  union all
  select 99, 'RESULTADO GERAL', case when exists (select 1 from checagens where resultado = 'FALHA') then 'REPROVADO' else 'APROVADO' end
) x
order by ordem;
