import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { atorDaSessao, exigirSessao } from "@/lib/adminSessao";
import { erroInterno } from "@/lib/respostas";
import { registrarAuditoria } from "@/lib/auditoria";
import { edicaoIdValido } from "@/config/casas";
import { CAMPOS_INGRESSO, semMigracaoDeIngressos } from "@/lib/ingressos";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/admin/ingressos?edicao=<id> — ingressos individuais da noite e o valor do ingresso (null = não vende). */
export async function GET(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const edicao = new URL(req.url).searchParams.get("edicao");
  if (!edicaoIdValido(edicao)) return NextResponse.json({ erro: "Informe a edição." }, { status: 400 });
  const db = supabaseAdmin();
  const [lista, regras] = await Promise.all([
    db.from("ingressos").select(CAMPOS_INGRESSO).eq("edicao_id", edicao).order("created_at", { ascending: true }),
    db.from("edicoes_regras").select("ingresso_centavos, capacidade_maxima").eq("edicao_id", edicao).maybeSingle(),
  ]);
  if (semMigracaoDeIngressos(lista.error)) return NextResponse.json({ migrado: false, ingressos: [], valor_centavos: null, capacidade: null });
  if (lista.error) return NextResponse.json({ erro: erroInterno(lista.error) }, { status: 500 });
  const r = (regras.data ?? null) as { ingresso_centavos?: number | null; capacidade_maxima?: number | null } | null;
  return NextResponse.json({ migrado: true, ingressos: lista.data ?? [], valor_centavos: r?.ingresso_centavos ?? null, capacidade: r?.capacidade_maxima ?? null });
}

/**
 * PATCH /api/admin/ingressos — `{ id, status: "cancelado" | "confirmado" }` cancela ou reativa um ingresso;
 * `{ edicao, valor_centavos }` grava o valor do ingresso da noite (null = a noite deixa de vender ingresso pelo site).
 */
export async function PATCH(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const ator = await atorDaSessao();
  const body = await req.json().catch(() => null);
  const db = supabaseAdmin();
  const agora = new Date().toISOString();

  if (body && typeof body.id === "string") {
    if (!UUID_RE.test(body.id) || (body.status !== "cancelado" && body.status !== "confirmado")) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
    const { data, error } = await db.from("ingressos").update({ status: body.status, updated_at: agora }).eq("id", body.id).select(CAMPOS_INGRESSO).maybeSingle();
    if (error) return NextResponse.json({ erro: erroInterno(error) }, { status: 500 });
    if (!data) return NextResponse.json({ erro: "Ingresso não encontrado." }, { status: 404 });
    await registrarAuditoria({ ator, acao: body.status === "cancelado" ? "ingresso_cancelado" : "ingresso_reativado", entidade: "ingresso", entidadeId: body.id });
    return NextResponse.json({ ingresso: data });
  }

  if (body && edicaoIdValido(body.edicao)) {
    const v = body.valor_centavos;
    if (v !== null && !(Number.isInteger(v) && v >= 0 && v <= 10_000_000)) return NextResponse.json({ erro: "Valor inválido." }, { status: 400 });
    const { data, error } = await db.from("edicoes_regras").update({ ingresso_centavos: v, updated_at: agora }).eq("edicao_id", body.edicao).select("edicao_id").maybeSingle();
    if (error) return NextResponse.json({ erro: erroInterno(error) }, { status: 500 });
    if (!data) return NextResponse.json({ erro: "Preencha e salve as regras da noite antes (aba Regras)." }, { status: 409 });
    await registrarAuditoria({ ator, acao: "ingresso_valor", entidade: "edicao", entidadeId: body.edicao, detalhe: { valor_centavos: v } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
}
