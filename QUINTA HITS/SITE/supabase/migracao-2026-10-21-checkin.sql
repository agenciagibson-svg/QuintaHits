-- QUINTA HITS — migração (21/10/2026): check-in na entrada (QR code) e "não compareceu".
--
-- ADITIVA e idempotente. Rode ANTES de publicar o site novo (o site atual ignora as colunas novas).
--   1. reservas.chegou_em / reservas.checkin_por: hora da chegada registrada na porta e quem registrou;
--   2. status novo 'nao_compareceu': reserva confirmada sem check-in depois do fim da tolerância (solta a mesa).
-- Reversão: reverter-2026-10-21-checkin.sql.

alter table reservas add column if not exists chegou_em timestamptz;
alter table reservas add column if not exists checkin_por text;

alter table reservas drop constraint if exists reservas_status_valido;
alter table reservas add constraint reservas_status_valido
  check (status in ('aguardando', 'confirmada', 'expirada', 'cancelada', 'nao_compareceu'));

-- Comparecimento por noite (painel) e busca dos que ainda não chegaram.
create index if not exists reservas_edicao_chegada on reservas (edicao_id, chegou_em);

comment on column reservas.chegou_em is 'Check-in na entrada (QR ou código). NULL = ainda não chegou.';
comment on column reservas.checkin_por is 'Quem registrou a chegada (e-mail da equipe/casa).';
