import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditarPainel, exigirSessao } from "@/lib/adminSessao";
import { erroInterno } from "@/lib/respostas";
import { validarEdicao } from "@/lib/adminValidacao";
import { dataISOValida, ehQuinta } from "@/lib/edicao";
import { CASAS, CASA_PADRAO, casaDoParametro, edicaoIdDe } from "@/config/casas";

export const dynamic = "force-dynamic";

/** GET /api/admin/edicoes?casa=harley-grill — todas as edições da casa (inclusive passadas). Sem `casa`: Quinta Hits. */
export async function GET(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const casa = casaDoParametro(new URL(req.url).searchParams.get("casa"));
  if (!casa) return NextResponse.json({ erro: "Casa inválida." }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("edicoes")
    .select("*")
    .eq("casa", casa)
    .order("data", { ascending: false });

  if (error) return NextResponse.json({ erro: erroInterno(error) }, { status: 500 });
  return NextResponse.json({ edicoes: data });
}

/**
 * POST /api/admin/edicoes — cria uma nova edição. Quinta Hits: id = mesma data (YYYY-MM-DD, sempre uma quinta).
 * Outras casas (`casa` no corpo): qualquer dia, id = 'AAAA-MM-DD_<casa>'.
 */
export async function POST(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  const casa = casaDoParametro(typeof body.casa === "string" ? body.casa : null);
  if (!casa) return NextResponse.json({ erro: "Casa inválida." }, { status: 400 });
  if (!dataISOValida(body.data)) return NextResponse.json({ erro: "Data inválida (AAAA-MM-DD)." }, { status: 400 });
  if (CASAS[casa].soQuinta && !ehQuinta(body.data)) {
    return NextResponse.json({ erro: "A data precisa ser uma quinta-feira (AAAA-MM-DD)." }, { status: 400 });
  }

  const validacao = validarEdicao(body);
  if ("erro" in validacao) return NextResponse.json({ erro: validacao.erro }, { status: 400 });

  const id = edicaoIdDe(casa, body.data);
  const registro: Record<string, unknown> = { status: "a_confirmar", ...validacao.campos, id, data: body.data, casa };
  // Outras casas: local vazio nasce com o nome da casa (a Quinta Hits segue como sempre: o painel informa o local).
  if (casa !== CASA_PADRAO && !registro.local) registro.local = CASAS[casa].local;
  const { data, error } = await supabaseAdmin().from("edicoes").insert(registro).select().single();
  if (error?.code === "23505") {
    return NextResponse.json({ erro: `Já existe uma edição em ${body.data} nesta casa.` }, { status: 409 });
  }
  if (error) return NextResponse.json({ erro: erroInterno(error) }, { status: 500 });

  revalidatePath("/", "layout");
  await auditarPainel("edicao_criada", "edicao", id);
  return NextResponse.json({ edicao: data }, { status: 201 });
}
