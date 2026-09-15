import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirSessao } from "@/lib/adminSessao";
import { validarConfig } from "@/lib/adminValidacao";

export const dynamic = "force-dynamic";

/** GET /api/admin/config — linha única de configuração editável do site. */
export async function GET() {
  const negado = await exigirSessao();
  if (negado) return negado;

  const { data, error } = await supabaseAdmin()
    .from("site_config")
    .select("casa_endereco, casa_bairro, casa_instagram, reserva_url, horario_padrao")
    .eq("id", 1)
    .maybeSingle();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ config: data ?? {} });
}

/** PUT /api/admin/config — atualiza os campos enviados (cria a linha única se ainda não existir). */
export async function PUT(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const validacao = validarConfig(body);
  if ("erro" in validacao) return NextResponse.json({ erro: validacao.erro }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("site_config")
    .upsert({ id: 1, ...validacao.campos, updated_at: new Date().toISOString() })
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  revalidatePath("/", "layout");
  return NextResponse.json({ config: data });
}
