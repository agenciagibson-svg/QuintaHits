-- QUINTA HITS — verificação do banco ATUAL depois da migração (somente leitura, SEM seed).
--
-- Rode DEPOIS de 2-aplicar.sql. Uma linha por verificação, OK ou FALHA, e a última linha com o veredito.
-- CRITÉRIO DE APROVAÇÃO: nenhuma linha FALHA e "RESULTADO GERAL = APROVADO".
-- (O teste de acesso por papel anon/authenticated, que exige comandos separados, está em DOCS/AGENTE_RESERVAS_QUINTA_HITS.md, seção 28.)

with tabelas(nome) as (
  values ('wa_config'), ('edicoes_regras'), ('edicoes_mesas'), ('wa_contatos'), ('wa_conversas'),
         ('wa_transferencias'), ('wa_mensagens'), ('wa_webhook_eventos'), ('wa_fila_saida'),
         ('wa_fila_tentativas'), ('auditoria'), ('reservas_historico')
),
checagens as (
  select 1 as ordem, 'Tabela existe: ' || t.nome as verificacao,
         case when to_regclass('public.' || t.nome) is not null then 'OK' else 'FALHA' end as resultado
  from tabelas t
  union all
  select 2, 'RLS ligado em ' || t.nome,
         case when coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.' || t.nome)), false) then 'OK' else 'FALHA' end
  from tabelas t
  union all
  select 3, 'anon/authenticated sem permissão em ' || t.nome,
         case when to_regclass('public.' || t.nome) is not null
                   and not has_table_privilege('anon', 'public.' || t.nome, 'SELECT,INSERT,UPDATE,DELETE')
                   and not has_table_privilege('authenticated', 'public.' || t.nome, 'SELECT,INSERT,UPDATE,DELETE')
              then 'OK' else 'FALHA' end
  from tabelas t
  union all
  select 4, 'Nenhuma policy nas tabelas novas',
         case when not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename in (select nome from tabelas)) then 'OK' else 'FALHA' end
  union all
  select 4, 'Nenhuma view no schema public',
         case when not exists (select 1 from information_schema.views where table_schema = 'public') then 'OK' else 'FALHA' end
  union all
  select 5, 'reservas.' || c.nome || ' existe',
         case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reservas' and column_name = c.nome) then 'OK' else 'FALHA' end
  from (values ('origem_reserva'), ('contato_id'), ('observacoes'), ('atendente')) as c(nome)
  union all
  select 5, 'Gatilho de histórico de reservas existe',
         case when exists (select 1 from pg_trigger where tgname = 'reservas_historico_trg' and not tgisinternal) then 'OK' else 'FALHA' end
  union all
  select 5, 'Toda reserva já existente ficou com origem_reserva = site',
         case when not exists (select 1 from reservas where origem_reserva <> 'site') then 'OK' else 'FALHA' end
  union all
  select 6, 'Índice único de mesa por edição (reservas_mesa_ocupada) continua de pé',
         case when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'reservas_mesa_ocupada' and indexdef ilike '%unique%') then 'OK' else 'FALHA' end
  union all
  select 6, 'Tabelas do site intactas (edicoes, mesas, reservas, site_config)',
         case when to_regclass('public.edicoes') is not null and to_regclass('public.mesas') is not null
                   and to_regclass('public.reservas') is not null and to_regclass('public.site_config') is not null then 'OK' else 'FALHA' end
  union all
  select 7, 'wa_config: banco marcado como homologacao (fase de testes)',
         case when (select ambiente from wa_config where id = 1) = 'homologacao' then 'OK' else 'FALHA' end
  union all
  select 7, 'wa_config: agente e envio DESLIGADOS',
         case when (select not agente_ativo and not envio_ativo from wa_config where id = 1) then 'OK' else 'FALHA' end
  union all
  select 7, 'wa_config: restrito a números de teste',
         case when (select restringir_a_numeros_teste from wa_config where id = 1) then 'OK' else 'FALHA' end
  union all
  select 7, 'wa_config: nenhum número de teste cadastrado ainda',
         case when (select cardinality(numeros_teste) = 0 from wa_config where id = 1) then 'OK' else 'FALHA' end
  union all
  select 7, 'wa_config: limpeza de retenção DESLIGADA e política NÃO validada',
         case when (select not limpeza_ativa and politica_retencao_validada_em is null from wa_config where id = 1) then 'OK' else 'FALHA' end
  union all
  -- sem seed: nada de dados fictícios neste banco
  select 8, 'Sem dados fictícios do seed (mesas T01–T06 e edições de 2027)',
         case when not exists (select 1 from mesas where numero in ('T01','T02','T03','T04','T05','T06'))
                   and not exists (select 1 from edicoes where id like '2027-%' and artista like '[TESTE]%') then 'OK' else 'FALHA' end
)
select verificacao, resultado from (
  select ordem, verificacao, resultado from checagens
  union all
  select 99, 'RESULTADO GERAL',
         case when count(*) filter (where resultado = 'FALHA') = 0 then 'APROVADO' else 'REPROVADO' end
  from checagens
) r
order by ordem, verificacao;
