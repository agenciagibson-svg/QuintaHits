import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditarPainel, exigirSessao } from "@/lib/adminSessao";
import { erroInterno } from "@/lib/respostas";
import { validarPlanta } from "@/lib/planta";
import { carregarPlanta } from "@/lib/plantaBanco";

export const dynamic = "force-dynamic";

/** GET /api/admin/planta — elementos do salão (palco, bar...) desenhados no mapa. */
export async function GET() {
  const negado = await exigirSessao();
  if (negado) return negado;
  return NextResponse.json(await carregarPlanta());
}

/** PUT /api/admin/planta — substitui a lista inteira de elementos. */
export async function PUT(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const body = await req.json().catch(() => null);
  const validacao = validarPlanta(body?.elementos);
  if ("erro" in validacao) return NextResponse.json({ erro: validacao.erro }, { status: 400 });

  if (!(await carregarPlanta()).migrado) {
    return NextResponse.json({ erro: "Aplique a migração da planta do salão (migracao-2026-09-29-planta-do-salao.sql) no Supabase." }, { status: 503 });
  }

  const { error } = await supabaseAdmin()
    .from("site_config")
    .upsert({ id: 1, planta: { elementos: validacao.elementos }, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ erro: erroInterno(error) }, { status: 500 });

  await auditarPainel("planta_atualizada", "site_config", "1", { elementos: validacao.elementos.length });
  return NextResponse.json({ migrado: true, elementos: validacao.elementos });
}
