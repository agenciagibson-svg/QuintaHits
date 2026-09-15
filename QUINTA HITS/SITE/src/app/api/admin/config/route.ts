import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const CAMPOS = ["casa_endereco", "casa_bairro", "casa_instagram", "reserva_url", "horario_padrao"] as const;

/** GET /api/admin/config — linha única de configuração editável do site. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from("site_config")
    .select("casa_endereco, casa_bairro, casa_instagram, reserva_url, horario_padrao")
    .eq("id", 1)
    .maybeSingle();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ config: data ?? {} });
}

/** PUT /api/admin/config — atualiza os campos enviados. */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const atualizacao: Record<string, string> = {};
  for (const campo of CAMPOS) {
    if (typeof body[campo] === "string") atualizacao[campo] = body[campo];
  }
  atualizacao.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin()
    .from("site_config")
    .update(atualizacao)
    .eq("id", 1)
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ config: data });
}
