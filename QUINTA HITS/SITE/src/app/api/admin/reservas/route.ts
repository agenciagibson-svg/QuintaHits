import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { atorDaSessao, exigirSessao } from "@/lib/adminSessao";
import { erroInterno } from "@/lib/respostas";
import { hojeISO } from "@/lib/edicao";
import { edicaoIdValido } from "@/config/casas";
import { expirarPedidosVencidos } from "@/lib/reservas";
import { ocuparMesa } from "@/lib/ocuparMesa";

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

/**
 * POST /api/admin/reservas — a equipe ocupa uma mesa pelo painel (mapa da aba Reservas), em qualquer casa:
 *   { edicao_id, mesa_id, nome, whatsapp, pessoas }  → reserva de cliente (telefone, balcão, Instagram), já CONFIRMADA;
 *   { edicao_id, mesa_id, travar: true, motivo? }     → mesa TRAVADA na noite (ninguém reserva; o site mostra "reservada").
 * As regras ficam em `ocuparMesa` (lib/ocuparMesa.ts), as mesmas do app da casa.
 */
export async function POST(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const body = await req.json().catch(() => null);
  const r = await ocuparMesa(body, { ator: await atorDaSessao(), origem: "painel" });
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.id, mesa: r.mesa, codigo: r.codigo }, { status: 201 });
}
