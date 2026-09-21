import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirSessao } from "@/lib/adminSessao";

export const dynamic = "force-dynamic";

/**
 * PUT /api/admin/reservas/:id — confirmar à mão (ex.: cliente não conseguiu mandar o código) ou cancelar.
 * "aguardando" e "expirada" são só do fluxo automático e não se escolhem no painel.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (status !== "confirmada" && status !== "cancelada") {
    return NextResponse.json({ erro: "Status inválido." }, { status: 400 });
  }

  const agora = new Date().toISOString();
  const { data, error } = await supabaseAdmin()
    .from("reservas")
    .update({ status, updated_at: agora, ...(status === "confirmada" ? { confirmada_em: agora } : {}) })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();

  // Confirmar de novo um pedido expirado/cancelado quando a mesa já foi pega por outra pessoa.
  if (error?.code === "23505") {
    return NextResponse.json({ erro: "Essa mesa já tem outro pedido ativo nesta edição." }, { status: 409 });
  }
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ erro: "Reserva não encontrada." }, { status: 404 });
  return NextResponse.json({ reserva: data });
}
