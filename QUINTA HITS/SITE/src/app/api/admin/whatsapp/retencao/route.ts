import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/adminSessao";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ambienteAtual } from "@/lib/agente/ambiente";
import { executarRetencao } from "@/lib/agente/retencao";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/whatsapp/retencao — corpo `{ executar?: boolean }`. Por padrão SIMULA (só conta). A execução real
 * só é liberada com RETENCAO_ENABLED=true, wa_config.limpeza_ativa e (em produção) a política validada; do contrário
 * responde 409 e não altera nada. Devolve apenas quantidades.
 */
export async function POST(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const body = await req.json().catch(() => null);
  const executar = body?.executar === true;
  try {
    const r = await executarRetencao(supabaseAdmin(), { simular: !executar, retencaoEnv: process.env.RETENCAO_ENABLED, ambienteApp: ambienteAtual() });
    return NextResponse.json(r);
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "";
    if (mensagem.startsWith("Retenção: execução real recusada")) return NextResponse.json({ erro: mensagem }, { status: 409 });
    console.error("Erro na rotina de retenção:", mensagem);
    return NextResponse.json({ erro: "Não foi possível executar a rotina de retenção." }, { status: 500 });
  }
}
