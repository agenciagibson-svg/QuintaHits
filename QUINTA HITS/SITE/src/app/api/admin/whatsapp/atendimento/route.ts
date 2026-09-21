import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/adminSessao";
import { FILTROS_DE_ATENDIMENTO, listarAtendimentos, type FiltroAtendimento } from "@/lib/agente/atendimento";
import { envioRealAtivoAgora } from "@/lib/agente/estadoEnvio";
import { erroInterno } from "@/lib/respostas";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/whatsapp/atendimento?status=abertas|aguardando|assumida|devolvida|encerrada|todas
 * Fila "Aguardando atendimento humano" e histórico. Traz `envio_real`: falso = respostas do painel ficam em modo simulado.
 * Sem a migração aplicada neste banco devolve `{ migrado: false, pendentes: 0, itens: [] }` (o painel só mostra um aviso).
 */
export async function GET(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const pedido = new URL(req.url).searchParams.get("status") ?? "abertas";
  if (!FILTROS_DE_ATENDIMENTO.includes(pedido as FiltroAtendimento)) return NextResponse.json({ erro: "Filtro inválido." }, { status: 400 });
  try {
    const r = await listarAtendimentos(pedido as FiltroAtendimento);
    if (!r) return NextResponse.json({ migrado: false, pendentes: 0, nao_lidas: 0, itens: [], envio_real: false });
    return NextResponse.json({ migrado: true, envio_real: await envioRealAtivoAgora(), ...r });
  } catch (e) {
    console.error("Erro ao listar atendimentos:", e instanceof Error ? e.message : "erro");
    return NextResponse.json({ erro: erroInterno(null) }, { status: 500 });
  }
}
