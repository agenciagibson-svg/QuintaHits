import "server-only";
import { randomInt } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hojeISO, inicioDaEdicao } from "@/lib/edicao";
import { MAX_RESERVAS_POR_WHATSAPP, STATUS_OCUPA_MESA } from "@/lib/reserva";
import { verificarMesa } from "@/lib/disponibilidade";
import { edicaoReservavel } from "@/lib/reservas";
import { carregarPainelDeRegras } from "@/lib/regras";
import { registrarAuditoria } from "@/lib/auditoria";
import type { Contato } from "./repositorio";
import type { ReservaResumo, ResultadoCancelamento, ResultadoCriacao } from "./tipos";

/**
 * Reservas feitas pelo agente. Escrevem nas MESMAS tabelas do site (`reservas`) e disputam a MESMA trava do banco
 * (índice único por edição e mesa): não existe estoque paralelo. A confirmação ao cliente só acontece depois de
 * a linha estar gravada aqui.
 */

const codigoAleatorio = () => `QH-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;

export async function criarReservaDoAgente(p: { contato: Contato; edicaoId: string; mesaId: string; pessoas: number; nome: string; observacoes: string }): Promise<ResultadoCriacao> {
  const { contato } = p;
  if (!contato.telefone) return { ok: false, motivo: "erro" };
  try {
    if (!(await edicaoReservavel(p.edicaoId))) return { ok: false, motivo: "edicao_fechada" };
    const painel = await carregarPainelDeRegras(p.edicaoId);
    if (!painel.migrado || !painel.prontidao.pronta) return { ok: false, motivo: "nao_pronta" };

    const verificacao = await verificarMesa(p.edicaoId, p.mesaId, "whatsapp", p.pessoas);
    if (!verificacao.ok) return { ok: false, motivo: "mesa_indisponivel" };

    const db = supabaseAdmin();
    const { count, error: erroContagem } = await db
      .from("reservas")
      .select("id", { count: "exact", head: true })
      .eq("edicao_id", p.edicaoId)
      .eq("whatsapp", contato.telefone)
      .in("status", STATUS_OCUPA_MESA);
    if (erroContagem) return { ok: false, motivo: "erro" };
    if ((count ?? 0) >= MAX_RESERVAS_POR_WHATSAPP) return { ok: false, motivo: "limite_por_whatsapp" };

    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const codigo = codigoAleatorio();
      const { count: existente } = await db.from("reservas").select("id", { count: "exact", head: true }).eq("codigo", codigo);
      if ((existente ?? 0) > 0) continue;
      const agora = new Date().toISOString();
      const { data, error } = await db
        .from("reservas")
        .insert({
          edicao_id: p.edicaoId, mesa_id: p.mesaId, nome: p.nome, whatsapp: contato.telefone, pessoas: p.pessoas, status: "confirmada",
          confirmada_em: agora, codigo, origem_reserva: "whatsapp_agent", contato_id: contato.id, observacoes: p.observacoes,
        })
        .select("id")
        .single();
      // Índice único do banco: outro canal reservou esta mesa um instante antes.
      if (error?.code === "23505") return { ok: false, motivo: "mesa_indisponivel" };
      if (error) return { ok: false, motivo: "erro" };
      await registrarAuditoria({ ator: "agente", acao: "reserva_criada", entidade: "reserva", entidadeId: (data as { id: string }).id, detalhe: { origem: "whatsapp_agent", pessoas: p.pessoas } });
      return { ok: true, codigo, mesaNumero: verificacao.mesa.numero };
    }
    return { ok: false, motivo: "erro" };
  } catch {
    return { ok: false, motivo: "erro" };
  }
}

type LinhaReserva = {
  id: string; codigo: string | null; edicao_id: string; nome: string; observacoes: string | null; pessoas: number; status: "aguardando" | "confirmada";
  mesas: { numero: string } | null; edicoes: { data: string; horario: string } | null;
};

/** Reservas ativas e futuras deste número (do site ou do agente): quem escreve é o dono do WhatsApp informado. */
export async function reservasDoContato(contato: Contato, agora = new Date()): Promise<ReservaResumo[]> {
  if (!contato.telefone) return [];
  const { data, error } = await supabaseAdmin()
    .from("reservas")
    .select("id, codigo, edicao_id, nome, observacoes, pessoas, status, mesas(numero), edicoes(data, horario)")
    .eq("whatsapp", contato.telefone)
    .in("status", STATUS_OCUPA_MESA)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Erro ao buscar reservas: ${error.message}`);
  const hoje = hojeISO(agora);
  return ((data ?? []) as unknown as LinhaReserva[])
    .filter((r) => r.edicoes && r.edicoes.data >= hoje)
    .map((r) => ({
      id: r.id, codigo: r.codigo ?? "", edicaoId: r.edicao_id, data: r.edicoes!.data, horario: r.edicoes!.horario, mesaNumero: r.mesas?.numero ?? "",
      pessoas: r.pessoas, nome: r.nome, observacoes: r.observacoes ?? "", status: r.status,
    }));
}

/** Cancela respeitando o prazo cadastrado na edição. Prazo não cadastrado ou vencido: quem decide é uma pessoa. */
export async function cancelarReservaDoContato(contato: Contato, reservaId: string, agora = new Date()): Promise<ResultadoCancelamento> {
  try {
    const reserva = (await reservasDoContato(contato, agora)).find((r) => r.id === reservaId);
    if (!reserva) return "nao_encontrada";
    const { data: regras } = await supabaseAdmin().from("edicoes_regras").select("cancelamento_ate_horas").eq("edicao_id", reserva.edicaoId).maybeSingle();
    const horas = (regras as { cancelamento_ate_horas: number | null } | null)?.cancelamento_ate_horas ?? null;
    if (horas === null) return "regra_indefinida";
    const limite = inicioDaEdicao(reserva.data, reserva.horario).getTime() - horas * 3_600_000;
    if (agora.getTime() > limite) return "fora_do_prazo";

    const { data, error } = await supabaseAdmin()
      .from("reservas")
      .update({ status: "cancelada", updated_at: agora.toISOString() })
      .eq("id", reservaId)
      .in("status", STATUS_OCUPA_MESA)
      .select("id")
      .maybeSingle();
    if (error) return "erro";
    if (!data) return "nao_encontrada";
    await registrarAuditoria({ ator: "agente", acao: "reserva_cancelada", entidade: "reserva", entidadeId: reservaId, detalhe: { origem: "whatsapp_agent" } });
    return "ok";
  } catch {
    return "erro";
  }
}

/** Alteração de nome e observações (não mexe no estoque). */
export async function atualizarReservaDoContato(contato: Contato, reservaId: string, campos: { nome?: string; observacoes?: string }, agora = new Date()): Promise<boolean> {
  try {
    const reserva = (await reservasDoContato(contato, agora)).find((r) => r.id === reservaId);
    if (!reserva) return false;
    const { data, error } = await supabaseAdmin().from("reservas").update({ ...campos, updated_at: agora.toISOString() }).eq("id", reservaId).in("status", STATUS_OCUPA_MESA).select("id").maybeSingle();
    if (error || !data) return false;
    await registrarAuditoria({ ator: "agente", acao: "reserva_atualizada", entidade: "reserva", entidadeId: reservaId, detalhe: { campos: Object.keys(campos) } });
    return true;
  } catch {
    return false;
  }
}
