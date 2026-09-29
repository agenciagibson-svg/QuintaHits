-- Reverte migracao-2026-09-29-planta-do-salao.sql (remove só a coluna criada por ela).
alter table site_config drop column if exists planta;
