import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/adminSessao";
import { listarAtendimentos } from "@/lib/agente/atendimento";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/whatsapp/atendimento — fila "Aguardando atendimento humano" e conversas em atendimento.
 * Sem a migração aplicada neste banco devolve `{ migrado: false, pendentes: 0, itens: [] }` (o painel só mostra um aviso).
 */
export async function GET() {
  const negado = await exigirSessao();
  if (negado) return negado;
  try {
    const r = await listarAtendimentos();
    if (!r) return NextResponse.json({ migrado: false, pendentes: 0, itens: [] });
    return NextResponse.json({ migrado: true, ...r });
  } catch (e) {
    console.error("Erro ao listar atendimentos:", e instanceof Error ? e.message : "erro");
    return NextResponse.json({ erro: "Não foi possível carregar a fila de atendimento." }, { status: 500 });
  }
}
