-- QUINTA HITS — REVERSÃO da migração PARTE 2 (21/09/2026). Remove SOMENTE o que a parte 2 criou.
-- Pode rodar mais de uma vez. NÃO toca em reservas, edições, mesas nem nas tabelas da parte 1.
--
-- O que se perde: as notas internas (wa_notas_internas), a marcação "reservas_site" de cada edição
-- (as edições voltam a NÃO estar liberadas para o site) e o controle de "lida até" dos atendimentos.
-- Antes de reverter com uso real, exporte wa_notas_internas.
--
-- Nota: o código publicado tolera a ausência desses itens (o site fica fechado para todas as edições e o painel
-- esconde notas e não lidas); reverter é seguro para o funcionamento do site.

drop table if exists wa_notas_internas;
alter table wa_transferencias drop column if exists lida_ate;
alter table edicoes_regras drop column if exists reservas_site;
