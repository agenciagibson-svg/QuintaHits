import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirSessao } from "@/lib/adminSessao";
import { validarEdicao } from "@/lib/adminValidacao";

export const dynamic = "force-dynamic";

/** PUT /api/admin/edicoes/:id — atualiza os campos enviados. A data não muda (é a chave da edição). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const validacao = validarEdicao(body);
  if ("erro" in validacao) return NextResponse.json({ erro: validacao.erro }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("edicoes")
    .update({ ...validacao.campos, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ erro: "Edição não encontrada." }, { status: 404 });

  revalidatePath("/", "layout");
  return NextResponse.json({ edicao: data });
}

/** DELETE /api/admin/edicoes/:id */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const { id } = await params;
  const { error } = await supabaseAdmin().from("edicoes").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
