-- Reverte migracao-2026-10-21-seguranca.sql (o site continua funcionando, sem estas proteções).
drop index if exists reservas_ip_noite;
alter table reservas drop column if exists origem_ip_hash;
drop table if exists sessoes_encerradas;
drop table if exists login_tentativas;
