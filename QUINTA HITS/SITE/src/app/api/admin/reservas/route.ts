import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirSessao } from "@/lib/adminSessao";
import { erroInterno } from "@/lib/respostas";
import { dataISOValida, hojeISO } from "@/lib/edicao";
import { expirarPedidosVencidos } from "@/lib/reservas";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reservas?edicao=AAAA-MM-DD — pedidos da edição, mais antigos primeiro.
 * GET /api/admin/reservas?pendentes=1       — pedidos "aguardando" de hoje em diante (contador do painel).
 */
export async function GET(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const params = new URL(req.url).searchParams;
  const pendentes = params.get("pendentes") === "1";
  const edicao = params.get("edicao");
  if (!pendentes && !dataISOValida(edicao)) return NextResponse.json({ erro: "Informe a edição." }, { status: 400 });

  try {
    await expirarPedidosVencidos();
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Erro ao expirar pedidos." }, { status: 500 });
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
    .select("id, edicao_id, mesa_id, nome, whatsapp, pessoas, status, codigo, expira_em, created_at")
    .eq("edicao_id", edicao)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ erro: erroInterno(error) }, { status: 500 });
  return NextResponse.json({ reservas: data ?? [] });
}
