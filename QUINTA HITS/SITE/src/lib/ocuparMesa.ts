import "server-only";
import { randomInt } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { erroInterno } from "@/lib/respostas";
import { hojeISO } from "@/lib/edicao";
import { CASAS, casaDaEdicaoId, edicaoIdValido, type CasaId } from "@/config/casas";
import { verificarMesa } from "@/lib/disponibilidade";
import { registrarAuditoria } from "@/lib/auditoria";
import { NOME_MESA_TRAVADA, inteiroEntre, normalizarWhatsapp } from "@/lib/reserva";
import { expirarPedidosVencidos } from "@/lib/reservas";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResultadoOcupar =
  | { ok: true; id: string; mesa: string | null; codigo: string | null }
  | { ok: false; status: number; erro: string };

const falha = (erro: string, status: number): ResultadoOcupar => ({ ok: false, status, erro });

/**
 * A equipe ocupa uma mesa numa noite — pelo mapa do painel (/admin) ou pelo app da casa (/casa):
 *   { edicao_id, mesa_id, nome, whatsapp, pessoas }  → reserva de cliente (telefone, balcão, Instagram), já CONFIRMADA;
 *   { edicao_id, mesa_id, travar: true, motivo? }     → mesa TRAVADA na noite (ninguém reserva; o site mostra "reservada").
 * Não depende da chave do site nem das regras da noite (é a equipe decidindo); só barra noite passada ou cancelada,
 * mesa de outra casa ou desligada para o painel e mesa já ocupada (índice único do banco → 409).
 *
 * `somenteDaCasa` (app da casa): noite de casa que a pessoa não atende = "não encontrada" (o dono do Florindos não
 * reserva nem trava mesa do Harley). A linha gravada é a mesma do painel (origem 'admin'): travada = sem WhatsApp.
 */
export async function ocuparMesa(
  body: unknown,
  opcoes: { ator: string; origem: "painel" | "casa"; somenteDaCasa?: readonly CasaId[] },
): Promise<ResultadoOcupar> {
  if (!body || typeof body !== "object") return falha("Pedido inválido.", 400);
  const b = body as Record<string, unknown>;
  const edicaoId = b.edicao_id;
  if (!edicaoIdValido(edicaoId)) return falha("Informe a noite.", 400);
  const casa = casaDaEdicaoId(edicaoId);
  if (opcoes.somenteDaCasa && !opcoes.somenteDaCasa.includes(casa)) return falha("Noite não encontrada.", 404);
  const mesaId = typeof b.mesa_id === "string" ? b.mesa_id : "";
  if (!UUID_RE.test(mesaId)) return falha("Escolha uma mesa no mapa.", 400);
  const travar = b.travar === true;

  let nome = NOME_MESA_TRAVADA;
  let whatsapp = "";
  let pessoas = 1;
  const motivo = typeof b.motivo === "string" ? b.motivo.trim().slice(0, 200) : "";
  if (!travar) {
    nome = typeof b.nome === "string" ? b.nome.trim() : "";
    if (nome.length < 2 || nome.length > 80) return falha("Informe o nome do cliente.", 400);
    const w = normalizarWhatsapp(b.whatsapp);
    if (!w) return falha("Informe o WhatsApp do cliente com DDD, ex.: (34) 99999-9999.", 400);
    whatsapp = w;
    const p = inteiroEntre(b.pessoas, 1, 50);
    if (!p) return falha("Informe quantas pessoas vão.", 400);
    pessoas = p;
  }

  try {
    const db = supabaseAdmin();
    const { data: ed, error: erroEd } = await db.from("edicoes").select("id, data, status").eq("id", edicaoId).maybeSingle();
    if (erroEd) throw erroEd;
    if (!ed) return falha("Noite não encontrada.", 404);
    const edicao = ed as { data: string; status: string };
    if (edicao.data < hojeISO()) return falha("Essa noite já passou.", 409);
    if (edicao.status === "cancelada") return falha("Essa noite foi cancelada.", 409);

    await expirarPedidosVencidos();
    const v = await verificarMesa(edicaoId, mesaId, "admin", pessoas);
    if (!v.ok && (v.motivo === "mesa_inexistente" || v.motivo === "canal_indisponivel")) return falha("Essa mesa não está disponível nesta noite.", 404);
    if (!v.ok && v.motivo === "ocupada") return falha("Essa mesa já está ocupada nesta noite.", 409);
    if (!v.ok && v.motivo === "lugares_insuficientes" && !travar) {
      return falha(`A mesa ${v.mesa?.numero ?? ""} é para até ${v.mesa?.lugares ?? 0} pessoas. Escolha uma mesa maior.`, 400);
    }

    const agora = new Date().toISOString();
    const codigo = travar ? null : `${CASAS[casa].prefixoCodigo}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
    const { data, error } = await db
      .from("reservas")
      .insert({
        edicao_id: edicaoId,
        mesa_id: mesaId,
        nome,
        whatsapp,
        pessoas,
        status: "confirmada",
        confirmada_em: agora,
        codigo,
        origem_reserva: "admin",
        observacoes: motivo,
        atendente: opcoes.ator,
      })
      .select("id")
      .single();
    if (error?.code === "23505") return falha("Essa mesa já está ocupada nesta noite.", 409);
    if (error) throw error;

    const id = (data as { id: string }).id;
    await registrarAuditoria({
      ator: opcoes.ator,
      acao: travar ? "mesa_travada" : opcoes.origem === "casa" ? "reserva_casa_criada" : "reserva_painel_criada",
      entidade: "reserva",
      entidadeId: id,
      detalhe: { edicao: edicaoId, mesa: v.mesa?.numero ?? null, origem: opcoes.origem },
    });
    return { ok: true, id, mesa: v.mesa?.numero ?? null, codigo };
  } catch (e) {
    return falha(erroInterno(e as { code?: string }), 500);
  }
}
