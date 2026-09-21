import type { BancoTeste } from "./bancoTeste";

/** Fábricas de cenário para os testes. Tudo fictício: nenhum dado real. */

export async function criarEdicao(b: BancoTeste, o: { id?: string; status?: string; artista?: string; horario?: string; local?: string } = {}) {
  const id = o.id ?? "2099-01-07";
  await b.sql(
    "insert into edicoes (id, data, artista, horario, local, status) values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing",
    [id, id, o.artista ?? "[TESTE] Artista", o.horario ?? "", o.local ?? "Florindos Bar", o.status ?? "confirmada"],
  );
  return id;
}

export async function criarMesa(b: BancoTeste, numero: string, lugares = 4, area = "Salão"): Promise<string> {
  const [m] = await b.sql<{ id: string }>("insert into mesas (numero, lugares, area) values ($1, $2, $3) returning id", [numero, lugares, area]);
  return m.id;
}

/** Pedido do SITE aguardando o código pelo WhatsApp (o fluxo atual). */
export async function criarPedidoAguardando(
  b: BancoTeste,
  o: { edicaoId: string; mesaId: string; codigo?: string; whatsapp?: string; pessoas?: number; expiraEmMin?: number; nome?: string },
) {
  const [r] = await b.sql<{ id: string }>(
    `insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, expira_em)
     values ($1, $2, $3, $4, $5, $6, now() + ($7 || ' minutes')::interval) returning id`,
    [o.edicaoId, o.mesaId, o.nome ?? "[TESTE] Cliente", o.whatsapp ?? "34999998888", o.pessoas ?? 2, o.codigo ?? "QH-123456", String(o.expiraEmMin ?? 15)],
  );
  return r.id;
}

export const statusDaReserva = async (b: BancoTeste, id: string) =>
  (await b.sql<{ status: string }>("select status from reservas where id = $1", [id]))[0]?.status;

/**
 * Deixa a edição COMPLETA e liberada para o site: horário do evento, todas as regras e `reservas_site`.
 * `sem` remove um campo para testar "regras incompletas"; `reservasSite: false` testa "completa, mas não liberada".
 */
export async function liberarEdicaoParaSite(b: BancoTeste, edicaoId: string, o: { reservasSite?: boolean; sem?: "abertura" | "reservas_ate" | "tolerancia_min" | "cancelamento_ate_horas" | "capacidade_maxima" | "consumacao_minima_centavos" | "instrucoes_chegada" | "horario" } = {}) {
  await b.sql("update edicoes set horario = $2 where id = $1", [edicaoId, o.sem === "horario" ? "" : "20h"]);
  const valores: Record<string, unknown> = {
    abertura: "20h",
    reservas_ate: "2099-01-07T18:00:00Z",
    tolerancia_min: 30,
    cancelamento_ate_horas: 24,
    capacidade_maxima: 200,
    consumacao_minima_centavos: 0,
    instrucoes_chegada: "[TESTE] Chegue até a tolerância.",
  };
  if (o.sem && o.sem !== "horario") valores[o.sem] = null;
  await b.sql(
    `insert into edicoes_regras (edicao_id, abertura, reservas_ate, tolerancia_min, cancelamento_ate_horas, capacidade_maxima, consumacao_minima_centavos, instrucoes_chegada, reservas_site)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (edicao_id) do update set abertura = excluded.abertura, reservas_ate = excluded.reservas_ate, tolerancia_min = excluded.tolerancia_min,
       cancelamento_ate_horas = excluded.cancelamento_ate_horas, capacidade_maxima = excluded.capacidade_maxima,
       consumacao_minima_centavos = excluded.consumacao_minima_centavos, instrucoes_chegada = excluded.instrucoes_chegada, reservas_site = excluded.reservas_site`,
    [edicaoId, valores.abertura, valores.reservas_ate, valores.tolerancia_min, valores.cancelamento_ate_horas, valores.capacidade_maxima, valores.consumacao_minima_centavos, valores.instrucoes_chegada, o.reservasSite ?? true],
  );
}
