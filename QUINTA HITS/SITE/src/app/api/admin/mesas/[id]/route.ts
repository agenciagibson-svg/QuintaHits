import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirSessao } from "@/lib/adminSessao";
import { validarMesa } from "@/lib/adminValidacao";

export const dynamic = "force-dynamic";

/** PUT /api/admin/mesas/:id — atualiza os campos enviados (inclusive posição ao arrastar no mapa). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const validacao = validarMesa(body);
  if ("erro" in validacao) return NextResponse.json({ erro: validacao.erro }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("mesas")
    .update({ ...validacao.campos, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error?.code === "23505") return NextResponse.json({ erro: "Já existe uma mesa com esse número." }, { status: 409 });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ erro: "Mesa não encontrada." }, { status: 404 });
  return NextResponse.json({ mesa: data });
}

/** DELETE /api/admin/mesas/:id — só mesa sem nenhuma reserva; com histórico, desative em vez de excluir. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const { id } = await params;
  const { error } = await supabaseAdmin().from("mesas").delete().eq("id", id);
  if (error?.code === "23503") {
    return NextResponse.json({ erro: "Essa mesa tem reservas registradas. Desative a mesa em vez de excluir." }, { status: 409 });
  }
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
