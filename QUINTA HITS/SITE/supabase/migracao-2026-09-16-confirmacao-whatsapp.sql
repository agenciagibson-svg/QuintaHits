-- QUINTA HITS — migração 16/09/2026 (2): confirmação automática da reserva pelo WhatsApp
-- Rode DEPOIS de migracao-2026-09-16-mesas-reservas.sql.
-- Rode no Supabase: SQL Editor → New query → colar → Run. Pode rodar mais de uma vez.
--
-- Fluxo: o pedido nasce 'aguardando' com um código (ex.: QH-482193) e prazo de 15 min.
-- O cliente manda o código pelo WhatsApp; o sistema confere o número e muda para 'confirmada'.
-- Sem mensagem no prazo, vira 'expirada' e a mesa volta a ficar livre.

alter table reservas add column if not exists codigo text;
alter table reservas add column if not exists expira_em timestamptz;
alter table reservas add column if not exists confirmada_em timestamptz;

-- A regra de status muda antes de converter os registros antigos (senão 'expirada' seria recusado).
alter table reservas drop constraint if exists reservas_status_valido;

-- Status antigos do fluxo manual. Pedido 'pendente' não tem código para o cliente mandar: expira e solta a mesa.
update reservas set status = 'expirada', expira_em = coalesce(expira_em, now()) where status = 'pendente';
update reservas set status = 'cancelada' where status = 'recusada';

alter table reservas alter column status set default 'aguardando';
alter table reservas add constraint reservas_status_valido
  check (status in ('aguardando', 'confirmada', 'expirada', 'cancelada'));

-- Mesa segurada = pedido aguardando mensagem ou confirmado.
drop index if exists reservas_mesa_ocupada;
create unique index reservas_mesa_ocupada
  on reservas (edicao_id, mesa_id)
  where status in ('aguardando', 'confirmada');

-- O código identifica o pedido na mensagem: não pode repetir entre pedidos aguardando.
create unique index if not exists reservas_codigo_aguardando
  on reservas (codigo)
  where status = 'aguardando';
