-- Reverte migracao-2026-11-17-ingressos.sql: APAGA todos os ingressos emitidos. Rode só depois de publicar um site sem ingressos.
drop function if exists emitir_ingresso(text, text, text, int, text, text);
drop table if exists ingressos;
alter table edicoes_regras drop constraint if exists edicoes_regras_ingresso_valido;
alter table edicoes_regras drop column if exists ingresso_centavos;
