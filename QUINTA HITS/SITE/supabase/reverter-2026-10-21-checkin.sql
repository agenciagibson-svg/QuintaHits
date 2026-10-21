-- Reverte migracao-2026-10-21-checkin.sql. Volte antes o site para a versão anterior.
-- Reservas 'nao_compareceu' voltam a 'cancelada' (a mesa já estava solta); as horas de chegada são apagadas.
begin;
update reservas set status = 'cancelada' where status = 'nao_compareceu';
alter table reservas drop constraint if exists reservas_status_valido;
alter table reservas add constraint reservas_status_valido check (status in ('aguardando', 'confirmada', 'expirada', 'cancelada'));
drop index if exists reservas_edicao_chegada;
alter table reservas drop column if exists checkin_por;
alter table reservas drop column if exists chegou_em;
commit;
