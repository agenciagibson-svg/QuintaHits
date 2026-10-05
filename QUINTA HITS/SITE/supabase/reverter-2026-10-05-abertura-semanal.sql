-- Reverte migracao-2026-10-05-abertura-semanal.sql (remove só o que ela criou; o site volta a abrir cada edição
-- assim que ela estiver completa e liberada).
alter table site_config drop constraint if exists site_config_reservas_abrem_validas;
alter table site_config drop column if exists reservas_abrem_hora;
alter table site_config drop column if exists reservas_abrem_dia;
