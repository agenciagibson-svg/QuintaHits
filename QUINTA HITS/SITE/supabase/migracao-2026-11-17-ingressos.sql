-- QUINTA HITS — migração (17/11/2026): ingresso individual, separado das mesas.
--
-- Primeiro uso: Fogo e Brasa (Caldas Novas/GO), Torresmo e Modão em 26/12/2026 — ingresso R$ 25,00 por pessoa.
-- Regras combinadas com a equipe:
--   - o cliente pede o ingresso no site e já sai confirmado, com QR de entrada; paga na portaria;
--   - quem reserva mesa NÃO compra ingresso (a mesa já inclui a entrada de quem senta nela);
--   - a venda para quando ingressos + pessoas das reservas de mesa chegam à capacidade máxima da noite.
--
-- ADITIVA e idempotente. Rode ANTES de publicar o site novo (o site atual ignora tabela e coluna novas).
-- Reversão: reverter-2026-11-17-ingressos.sql.

-- Valor do ingresso da noite. NULL = a noite não vende ingresso individual (só mesa), como antes.
alter table edicoes_regras add column if not exists ingresso_centavos int;
alter table edicoes_regras drop constraint if exists edicoes_regras_ingresso_valido;
alter table edicoes_regras add constraint edicoes_regras_ingresso_valido check (ingresso_centavos is null or ingresso_centavos >= 0);
comment on column edicoes_regras.ingresso_centavos is 'Valor do ingresso individual (por pessoa). NULL = não vende ingresso pelo site.';

create table if not exists ingressos (
  id uuid primary key default gen_random_uuid(),
  edicao_id text not null references edicoes(id) on delete cascade,
  nome text not null,
  whatsapp text not null,
  quantidade int not null,
  valor_unitario_centavos int not null default 0,
  codigo text not null,
  status text not null default 'confirmado',
  chegou_em timestamptz,
  checkin_por text,
  origem_ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingressos_quantidade_valida check (quantidade between 1 and 10),
  constraint ingressos_valor_valido check (valor_unitario_centavos >= 0),
  constraint ingressos_status_valido check (status in ('confirmado', 'cancelado')),
  constraint ingressos_nome_valido check (char_length(nome) between 2 and 80)
);
comment on table ingressos is 'Ingresso individual (sem mesa), pago na portaria. O id vai no QR de entrada.';

create unique index if not exists ingressos_codigo_por_edicao on ingressos (edicao_id, codigo);
create index if not exists ingressos_edicao_status on ingressos (edicao_id, status);

-- Só o servidor (chave de serviço) lê e grava: sem política, ninguém de fora acessa.
alter table ingressos enable row level security;

-- Emissão com trava por noite: dois pedidos ao mesmo tempo nunca passam da lotação.
create or replace function emitir_ingresso(p_edicao text, p_nome text, p_whatsapp text, p_quantidade int, p_codigo text, p_ip_hash text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor int;
  v_capacidade int;
  v_ocupados int;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('ingressos:' || p_edicao));
  select ingresso_centavos, capacidade_maxima into v_valor, v_capacidade from edicoes_regras where edicao_id = p_edicao;
  if v_valor is null then
    raise exception 'ingresso_indisponivel';
  end if;
  if v_capacidade is not null then
    select coalesce((select sum(quantidade) from ingressos where edicao_id = p_edicao and status = 'confirmado'), 0)
         + coalesce((select sum(pessoas) from reservas where edicao_id = p_edicao and status in ('aguardando', 'confirmada') and whatsapp <> ''), 0)
      into v_ocupados;
    if v_ocupados + p_quantidade > v_capacidade then
      raise exception 'lotado' using detail = greatest(v_capacidade - v_ocupados, 0)::text;
    end if;
  end if;
  insert into ingressos (edicao_id, nome, whatsapp, quantidade, valor_unitario_centavos, codigo, origem_ip_hash)
  values (p_edicao, p_nome, p_whatsapp, p_quantidade, v_valor, p_codigo, p_ip_hash)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function emitir_ingresso(text, text, text, int, text, text) from public, anon, authenticated;
grant execute on function emitir_ingresso(text, text, text, int, text, text) to service_role;

-- Fogo e Brasa, 26/12: ingresso R$ 25,00 e o texto dos valores sem misturar com as mesas.
update edicoes_regras
set ingresso_centavos = 2500,
    instrucoes_chegada = 'Ingresso individual: R$ 25,00 por pessoa, pago na portaria. A reserva de mesa já inclui a entrada de quem senta nela.',
    updated_at = now()
where edicao_id = '2026-12-26_fogo-e-brasa' and ingresso_centavos is null;
