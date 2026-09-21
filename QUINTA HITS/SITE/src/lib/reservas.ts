import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hojeISO, type Edicao } from "@/lib/edicao";
import { STATUS_OCUPA_MESA, type MesaPublica } from "@/lib/reserva";

const CAMPOS_EDICAO = "id, data, artista, instagram, tema, genero, horario, local, status, destaque";

/** Só dá para reservar edição cadastrada, de hoje em diante, que não foi cancelada nem já realizada. */
function aceitaReserva(e: Edicao, hoje: string): boolean {
  return e.data >= hoje && (e.status === "confirmada" || e.status === "a_confirmar");
}

/** Edições abertas para reserva, da mais próxima para a mais distante. */
export async function edicoesReservaveis(agora = new Date(), limite = 6): Promise<Edicao[]> {
  const hoje = hojeISO(agora);
  const { data, error } = await supabaseAdmin()
    .from("edicoes")
    .select(CAMPOS_EDICAO)
    .gte("data", hoje)
    .order("data", { ascending: true });
  if (error) throw new Error(`Erro ao buscar edições: ${error.message}`);
  return ((data ?? []) as Edicao[]).filter((e) => aceitaReserva(e, hoje)).slice(0, limite);
}

/** A edição, se ela aceita reserva agora; senão null. */
export async function edicaoReservavel(id: string, agora = new Date()): Promise<Edicao | null> {
  const { data, error } = await supabaseAdmin().from("edicoes").select(CAMPOS_EDICAO).eq("id", id).maybeSingle();
  if (error) throw new Error(`Erro ao buscar edição: ${error.message}`);
  return data && aceitaReserva(data as Edicao, hojeISO(agora)) ? (data as Edicao) : null;
}

/**
 * Pedidos "aguardando" com prazo vencido viram "expirada" e soltam a mesa.
 * Roda antes de toda leitura/gravação de reservas (não há tarefa agendada): o índice único
 * do banco só enxerga o status, então a mesa só fica livre depois dessa troca.
 */
export async function expirarPedidosVencidos(): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("reservas")
    .update({ status: "expirada", updated_at: new Date().toISOString() })
    .eq("status", "aguardando")
    .lt("expira_em", new Date().toISOString());
  if (error) throw new Error(`Erro ao expirar pedidos: ${error.message}`);
}

/** Mesas ativas e quais já estão seguradas na edição. Não devolve nada de quem reservou. */
export async function mapaDaEdicao(edicaoId: string): Promise<{ mesas: MesaPublica[]; ocupadas: string[] }> {
  await expirarPedidosVencidos();
  const [resMesas, resReservas] = await Promise.all([
    supabaseAdmin().from("mesas").select("id, numero, lugares, area, x, y").eq("ativa", true).order("numero"),
    supabaseAdmin().from("reservas").select("mesa_id").eq("edicao_id", edicaoId).in("status", STATUS_OCUPA_MESA),
  ]);
  if (resMesas.error) throw new Error(`Erro ao buscar mesas: ${resMesas.error.message}`);
  if (resReservas.error) throw new Error(`Erro ao buscar reservas: ${resReservas.error.message}`);
  return {
    mesas: (resMesas.data ?? []).map((m) => ({ ...m, x: Number(m.x), y: Number(m.y) })),
    ocupadas: (resReservas.data ?? []).map((r) => r.mesa_id),
  };
}
