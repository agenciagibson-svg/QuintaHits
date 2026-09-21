import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirSessao } from "@/lib/adminSessao";
import { dataISOValida } from "@/lib/edicao";
import { expirarPedidosVencidos } from "@/lib/reservas";

export const dynamic = "force-dynamic";

/** GET /api/admin/reservas?edicao=AAAA-MM-DD — pedidos da edição, mais antigos primeiro. */
export async function GET(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const edicao = new URL(req.url).searchParams.get("edicao");
  if (!dataISOValida(edicao)) return NextResponse.json({ erro: "Informe a edição." }, { status: 400 });

  try {
    await expirarPedidosVencidos();
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Erro ao expirar pedidos." }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin()
    .from("reservas")
    .select("id, edicao_id, mesa_id, nome, whatsapp, pessoas, status, codigo, expira_em, created_at")
    .eq("edicao_id", edicao)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ reservas: data ?? [] });
}
