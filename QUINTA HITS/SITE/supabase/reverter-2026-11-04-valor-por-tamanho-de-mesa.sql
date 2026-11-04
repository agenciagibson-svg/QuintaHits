-- QUINTA HITS — desfaz migracao-2026-11-04-valor-por-tamanho-de-mesa.sql (apaga a tabela de valores cadastrada).
alter table edicoes_regras drop constraint if exists edicoes_regras_precos_mesa_objeto;
alter table edicoes_regras drop column if exists precos_mesa;
