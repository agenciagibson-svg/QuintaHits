import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const CAMPOS = ["data", "artista", "instagram", "tema", "genero", "horario", "local", "status", "destaque"] as const;

/** PUT /api/admin/edicoes/:id — atualiza os campos enviados de uma edição existente. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const atualizacao: Record<string, string> = {};
  for (const campo of CAMPOS) {
    if (typeof body[campo] === "string") atualizacao[campo] = body[campo];
  }
  atualizacao.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin()
    .from("edicoes")
    .update(atualizacao)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ edicao: data });
}

/** DELETE /api/admin/edicoes/:id */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin().from("edicoes").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
