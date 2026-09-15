import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirSessao } from "@/lib/adminSessao";
import { validarEdicao } from "@/lib/adminValidacao";
import { dataISOValida, ehQuinta } from "@/lib/edicao";

export const dynamic = "force-dynamic";

/** GET /api/admin/edicoes — todas as edições (inclusive passadas), pro painel admin. */
export async function GET() {
  const negado = await exigirSessao();
  if (negado) return negado;

  const { data, error } = await supabaseAdmin()
    .from("edicoes")
    .select("*")
    .order("data", { ascending: false });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ edicoes: data });
}

/** POST /api/admin/edicoes — cria uma nova edição. id = mesma data (YYYY-MM-DD, sempre uma quinta). */
export async function POST(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  if (!dataISOValida(body.data) || !ehQuinta(body.data)) {
    return NextResponse.json({ erro: "A data precisa ser uma quinta-feira (AAAA-MM-DD)." }, { status: 400 });
  }

  const validacao = validarEdicao(body);
  if ("erro" in validacao) return NextResponse.json({ erro: validacao.erro }, { status: 400 });

  const registro = { status: "a_confirmar", ...validacao.campos, id: body.data, data: body.data };
  const { data, error } = await supabaseAdmin().from("edicoes").insert(registro).select().single();
  if (error?.code === "23505") {
    return NextResponse.json({ erro: `Já existe uma edição em ${body.data}.` }, { status: 409 });
  }
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  revalidatePath("/", "layout");
  return NextResponse.json({ edicao: data }, { status: 201 });
}
