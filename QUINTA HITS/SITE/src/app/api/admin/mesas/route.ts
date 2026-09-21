import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirSessao } from "@/lib/adminSessao";
import { validarMesa } from "@/lib/adminValidacao";

export const dynamic = "force-dynamic";

/** GET /api/admin/mesas — todas as mesas, inclusive desativadas. */
export async function GET() {
  const negado = await exigirSessao();
  if (negado) return negado;

  const { data, error } = await supabaseAdmin().from("mesas").select("id, numero, lugares, area, x, y, ativa").order("numero");
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ mesas: (data ?? []).map((m) => ({ ...m, x: Number(m.x), y: Number(m.y) })) });
}

/** POST /api/admin/mesas — cria uma mesa (número e lugares obrigatórios; sem posição, nasce no centro do mapa). */
export async function POST(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const validacao = validarMesa(body);
  if ("erro" in validacao) return NextResponse.json({ erro: validacao.erro }, { status: 400 });
  if (!validacao.campos.numero || validacao.campos.lugares === undefined) {
    return NextResponse.json({ erro: "Informe o número e os lugares da mesa." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin().from("mesas").insert(validacao.campos).select().single();
  if (error?.code === "23505") {
    return NextResponse.json({ erro: `Já existe a mesa ${validacao.campos.numero}.` }, { status: 409 });
  }
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ mesa: data }, { status: 201 });
}
