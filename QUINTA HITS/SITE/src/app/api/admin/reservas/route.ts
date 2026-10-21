import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { atorDaSessao, exigirSessao } from "@/lib/adminSessao";
import { erroInterno } from "@/lib/respostas";
import { hojeISO } from "@/lib/edicao";
import { CASAS, casaDaEdicaoId, edicaoIdValido } from "@/config/casas";
import { verificarMesa } from "@/lib/disponibilidade";
import { registrarAuditoria } from "@/lib/auditoria";
import { NOME_MESA_TRAVADA, inteiroEntre, normalizarWhatsapp } from "@/lib/reserva";
import { expirarPedidosVencidos } from "@/lib/reservas";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reservas?edicao=<id>  — pedidos da edição, mais antigos primeiro.
 * GET /api/admin/reservas?pendentes=1   — pedidos "aguardando" de hoje em diante, de todas as casas (contador do painel).
 */
export async function GET(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const params = new URL(req.url).searchParams;
  const pendentes = params.get("pendentes") === "1";
  const edicao = params.get("edicao");
  if (!pendentes && !edicaoIdValido(edicao)) return NextResponse.json({ erro: "Informe a edição." }, { status: 400 });

  try {
    await expirarPedidosVencidos();
  } catch (e) {
    return NextResponse.json({ erro: erroInterno(e as { code?: string }) }, { status: 500 });
  }

  if (pendentes) {
    const { data, error } = await supabaseAdmin()
      .from("reservas")
      .select("id, edicao_id, created_at")
      .eq("status", "aguardando")
      .gte("edicao_id", hojeISO())
      .order("created_at", { ascending: true });
    if (error) return NextResponse.json({ erro: erroInterno(error) }, { status: 500 });
    return NextResponse.json({ pendentes: data ?? [] });
  }

  const { data, error } = await supabaseAdmin()
    .from("reservas")
    .select("id, edicao_id, mesa_id, nome, whatsapp, pessoas, status, codigo, expira_em, created_at, origem_reserva, observacoes, chegou_em")
    .eq("edicao_id", edicao)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ erro: erroInterno(error) }, { status: 500 });
  return NextResponse.json({ reservas: data ?? [] });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const falha = (mensagem: string, status: number) => NextResponse.json({ erro: mensagem }, { status });

/**
 * POST /api/admin/reservas — a equipe ocupa uma mesa pelo painel (mapa da aba Reservas), em qualquer casa:
 *   { edicao_id, mesa_id, nome, whatsapp, pessoas }  → reserva de cliente (telefone, balcão, Instagram), já CONFIRMADA;
 *   { edicao_id, mesa_id, travar: true, motivo? }     → mesa TRAVADA na noite (ninguém reserva; o site mostra "reservada").
 * Não depende da chave do site nem das regras da noite (é a equipe decidindo); só barra noite passada ou cancelada,
 * mesa de outra casa ou desligada para o painel e mesa já ocupada (índice único do banco → 409).
 */
export async function POST(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return falha("Pedido inválido.", 400);
  const edicaoId = body.edicao_id;
  if (!edicaoIdValido(edicaoId)) return falha("Informe a noite.", 400);
  const mesaId = typeof body.mesa_id === "string" ? body.mesa_id : "";
  if (!UUID_RE.test(mesaId)) return falha("Escolha uma mesa no mapa.", 400);
  const travar = body.travar === true;

  let nome = NOME_MESA_TRAVADA;
  let whatsapp = "";
  let pessoas = 1;
  const motivo = typeof body.motivo === "string" ? body.motivo.trim().slice(0, 200) : "";
  if (!travar) {
    nome = typeof body.nome === "string" ? body.nome.trim() : "";
    if (nome.length < 2 || nome.length > 80) return falha("Informe o nome do cliente.", 400);
    const w = normalizarWhatsapp(body.whatsapp);
    if (!w) return falha("Informe o WhatsApp do cliente com DDD, ex.: (34) 99999-9999.", 400);
    whatsapp = w;
    const p = inteiroEntre(body.pessoas, 1, 50);
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

    const ator = await atorDaSessao();
    const agora = new Date().toISOString();
    const casa = casaDaEdicaoId(edicaoId);
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
        atendente: ator,
      })
      .select("id")
      .single();
    if (error?.code === "23505") return falha("Essa mesa já está ocupada nesta noite.", 409);
    if (error) throw error;

    await registrarAuditoria({
      ator,
      acao: travar ? "mesa_travada" : "reserva_painel_criada",
      entidade: "reserva",
      entidadeId: (data as { id: string }).id,
      detalhe: { edicao: edicaoId, mesa: v.mesa?.numero ?? null, origem: "painel" },
    });
    return NextResponse.json({ ok: true, id: (data as { id: string }).id, mesa: v.mesa?.numero ?? null, codigo }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ erro: erroInterno(e as { code?: string }) }, { status: 500 });
  }
}
