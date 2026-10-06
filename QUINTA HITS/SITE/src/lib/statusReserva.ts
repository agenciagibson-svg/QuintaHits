import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { registrarAuditoria } from "@/lib/auditoria";
import { hojeISO } from "@/lib/edicao";

export type NovoStatus = "confirmada" | "cancelada";
export type ResultadoStatus =
  | { ok: true; reserva: { id: string; status: string } }
  | { ok: false; status: 400 | 403 | 404 | 409 | 500; erro: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Confirma ou recusa/cancela uma reserva — a MESMA regra para o painel (/admin) e para o app da casa (/casa).
 * "aguardando" e "expirada" são só do fluxo automático e não se escolhem à mão.
 * `somenteDeHojeEmDiante`: o app da casa só mexe em reservas de hoje em diante (o histórico fica com o painel).
 */
export async function mudarStatusReserva(
  id: string,
  status: unknown,
  ator: string,
  opcoes: { origem: "painel" | "casa"; somenteDeHojeEmDiante?: boolean; agora?: Date },
): Promise<ResultadoStatus> {
  if (status !== "confirmada" && status !== "cancelada") return { ok: false, status: 400, erro: "Status inválido." };
  if (!UUID_RE.test(id)) return { ok: false, status: 404, erro: "Reserva não encontrada." };
  const db = supabaseAdmin();

  if (opcoes.somenteDeHojeEmDiante) {
    const { data, error } = await db.from("reservas").select("edicao_id").eq("id", id).maybeSingle();
    if (error) return { ok: false, status: 500, erro: "Não foi possível mudar a reserva." };
    if (!data) return { ok: false, status: 404, erro: "Reserva não encontrada." };
    if ((data as { edicao_id: string }).edicao_id < hojeISO(opcoes.agora)) {
      return { ok: false, status: 403, erro: "Essa quinta já passou: a reserva não pode mais ser alterada por aqui." };
    }
  }

  const agora = new Date().toISOString();
  const { data, error } = await db
    .from("reservas")
    .update({ status, updated_at: agora, ...(status === "confirmada" ? { confirmada_em: agora } : {}) })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();

  // Confirmar de novo um pedido expirado/cancelado quando a mesa já foi pega por outra pessoa.
  if (error?.code === "23505") return { ok: false, status: 409, erro: "Essa mesa já tem outro pedido ativo nesta edição." };
  if (error) {
    console.error("Erro ao mudar status da reserva:", error.code ?? "erro");
    return { ok: false, status: 500, erro: "Não foi possível mudar a reserva." };
  }
  if (!data) return { ok: false, status: 404, erro: "Reserva não encontrada." };
  await registrarAuditoria({ ator, acao: "reserva_status_alterado", entidade: "reserva", entidadeId: id, detalhe: { status, origem: opcoes.origem } });
  return { ok: true, reserva: data as { id: string; status: string } };
}
