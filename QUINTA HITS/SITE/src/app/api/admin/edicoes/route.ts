import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const CAMPOS = ["data", "artista", "instagram", "tema", "genero", "horario", "local", "status", "destaque"] as const;

/** GET /api/admin/edicoes — todas as edições (inclusive passadas), pro painel admin. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from("edicoes")
    .select("*")
    .order("data", { ascending: false });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ edicoes: data });
}

/** POST /api/admin/edicoes — cria uma nova edição. id = mesma data (YYYY-MM-DD). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.data) {
    return NextResponse.json({ erro: "Campo 'data' (YYYY-MM-DD) é obrigatório." }, { status: 400 });
  }

  const registro: Record<string, string> = { id: body.data, data: body.data };
  for (const campo of CAMPOS) {
    if (campo === "data") continue;
    if (typeof body[campo] === "string") registro[campo] = body[campo];
  }
  if (!registro.status) registro.status = "a_confirmar";

  const { data, error } = await supabaseAdmin().from("edicoes").insert(registro).select().single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ edicao: data }, { status: 201 });
}
