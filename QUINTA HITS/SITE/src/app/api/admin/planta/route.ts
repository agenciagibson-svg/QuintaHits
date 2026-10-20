import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditarPainel, exigirSessao } from "@/lib/adminSessao";
import { erroInterno } from "@/lib/respostas";
import { validarPlanta } from "@/lib/planta";
import { carregarPlanta } from "@/lib/plantaBanco";
import { CASA_PADRAO, casaDoParametro } from "@/config/casas";

export const dynamic = "force-dynamic";

/** GET /api/admin/planta?casa=harley-grill — elementos do salão (palco, bar...) desenhados no mapa da casa. Sem `casa`: Quinta Hits. */
export async function GET(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const casa = casaDoParametro(new URL(req.url).searchParams.get("casa"));
  if (!casa) return NextResponse.json({ erro: "Casa inválida." }, { status: 400 });
  return NextResponse.json(await carregarPlanta(casa));
}

/** PUT /api/admin/planta?casa=harley-grill — substitui a lista inteira de elementos da casa. */
export async function PUT(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const casa = casaDoParametro(new URL(req.url).searchParams.get("casa"));
  if (!casa) return NextResponse.json({ erro: "Casa inválida." }, { status: 400 });

  const body = await req.json().catch(() => null);
  const validacao = validarPlanta(body?.elementos);
  if ("erro" in validacao) return NextResponse.json({ erro: validacao.erro }, { status: 400 });

  if (!(await carregarPlanta(casa)).migrado) {
    return NextResponse.json({ erro: "Aplique a migração da planta do salão (migracao-2026-09-29-planta-do-salao.sql) no Supabase." }, { status: 503 });
  }

  const agora = new Date().toISOString();
  const { error } =
    casa === CASA_PADRAO
      ? await supabaseAdmin().from("site_config").upsert({ id: 1, planta: { elementos: validacao.elementos }, updated_at: agora })
      : await supabaseAdmin().from("casas").update({ planta: { elementos: validacao.elementos }, updated_at: agora }).eq("id", casa);
  if (error) return NextResponse.json({ erro: erroInterno(error) }, { status: 500 });

  await auditarPainel("planta_atualizada", casa === CASA_PADRAO ? "site_config" : "casa", casa === CASA_PADRAO ? "1" : casa, { elementos: validacao.elementos.length });
  return NextResponse.json({ migrado: true, elementos: validacao.elementos });
}
