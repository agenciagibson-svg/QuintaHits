import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditarPainel, exigirSessao } from "@/lib/adminSessao";
import { erroInterno } from "@/lib/respostas";
import { validarMesa } from "@/lib/adminValidacao";
import { casaDoParametro } from "@/config/casas";

export const dynamic = "force-dynamic";

/** GET /api/admin/mesas?casa=harley-grill — todas as mesas da casa, inclusive desativadas. Sem `casa`: Quinta Hits. */
export async function GET(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const casa = casaDoParametro(new URL(req.url).searchParams.get("casa"));
  if (!casa) return NextResponse.json({ erro: "Casa inválida." }, { status: 400 });

  const { data, error } = await supabaseAdmin().from("mesas").select("id, numero, lugares, area, x, y, ativa").eq("casa", casa).order("numero");
  if (error) return NextResponse.json({ erro: erroInterno(error) }, { status: 500 });
  return NextResponse.json({ mesas: (data ?? []).map((m) => ({ ...m, x: Number(m.x), y: Number(m.y) })) });
}

/** POST /api/admin/mesas — cria uma mesa na casa (`casa` no corpo; sem ela, Quinta Hits). Número e lugares obrigatórios; sem posição, nasce no centro do mapa. */
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

  const casa = casaDoParametro(typeof body.casa === "string" ? body.casa : null);
  if (!casa) return NextResponse.json({ erro: "Casa inválida." }, { status: 400 });

  const { data, error } = await supabaseAdmin().from("mesas").insert({ ...validacao.campos, casa }).select().single();
  if (error?.code === "23505") {
    return NextResponse.json({ erro: `Já existe a mesa ${validacao.campos.numero} nesta casa.` }, { status: 409 });
  }
  if (error) return NextResponse.json({ erro: erroInterno(error) }, { status: 500 });
  await auditarPainel("mesa_criada", "mesa", (data as { id: string }).id, { numero: validacao.campos.numero });
  return NextResponse.json({ mesa: data }, { status: 201 });
}
