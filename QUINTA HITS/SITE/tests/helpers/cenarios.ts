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
