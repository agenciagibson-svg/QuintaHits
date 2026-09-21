-- QUINTA HITS — REVERSÃO da migração 21/09/2026 (agente de reservas pelo WhatsApp)
--
-- Remove SOMENTE o que migracao-2026-09-21-agente-whatsapp.sql criou. Não toca em edicoes, site_config,
-- mesas, nem nos dados de reservas (só nas 4 colunas novas). Pode rodar mais de uma vez.
--
-- ATENÇÃO — o que se perde ao reverter:
--   * todo o conteúdo das 12 tabelas novas (contatos, conversas, mensagens, fila, regras por edição, auditoria...);
--   * as colunas reservas.origem_reserva / contato_id / observacoes / atendente.
-- Antes de reverter em banco com uso real, exporte essas tabelas.

-- Trava de segurança: não reverte se já existem reservas criadas pelo agente (perderia a origem).
-- Para reverter mesmo assim (ex.: homologação), apague as reservas de teste ou comente este bloco.
-- (SQL dinâmico: numa 2ª execução a coluna já não existe e o Postgres recusaria a consulta ao validar o nome.)
do $$
declare
  n int;
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'reservas' and column_name = 'origem_reserva'
  ) then
    execute 'select count(*) from reservas where origem_reserva <> ''site''' into n;
    if n > 0 then
      raise exception 'Reversão recusada: há % reserva(s) com origem diferente de "site". Exporte-as ou remova este bloco conscientemente.', n;
    end if;
  end if;
end $$;

drop trigger if exists reservas_historico_trg on reservas;
drop function if exists wa_registrar_historico_reserva();

alter table reservas drop constraint if exists reservas_origem_valida;
drop index if exists reservas_contato;
alter table reservas drop column if exists contato_id;
alter table reservas drop column if exists origem_reserva;
alter table reservas drop column if exists observacoes;
alter table reservas drop column if exists atendente;

drop table if exists reservas_historico;
drop table if exists auditoria;
drop table if exists wa_fila_tentativas;
drop table if exists wa_fila_saida;
drop table if exists wa_webhook_eventos;
drop table if exists wa_mensagens;
drop table if exists wa_transferencias;
drop table if exists wa_conversas;
drop table if exists wa_contatos;
drop table if exists edicoes_mesas;
drop table if exists edicoes_regras;
drop table if exists wa_config;
