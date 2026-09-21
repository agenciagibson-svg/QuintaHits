import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ambienteAtual } from "@/lib/agente/ambiente";
import { executarRetencao } from "@/lib/agente/retencao";

export const dynamic = "force-dynamic";

const igual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * GET /api/cron/retencao — para a TAREFA AGENDADA da limpeza de dados (a agenda em si NÃO está configurada: ver o documento mestre).
 * Autenticação: cabeçalho `Authorization: Bearer <CRON_SECRET>` (o formato que o Vercel Cron envia). Sem CRON_SECRET no
 * ambiente a rota fica desligada (503). Roda em MODO SIMULAÇÃO, a menos que RETENCAO_ENABLED=true E o banco (limpeza_ativa,
 * mesmo ambiente, política validada em produção) também liberem a execução real; se algo faltar, simula em vez de apagar.
 * Devolve só quantidades.
 */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || segredo.length < 16) return NextResponse.json({ erro: "Tarefa agendada desligada." }, { status: 503 });
  const recebido = req.headers.get("authorization") ?? "";
  if (!igual(recebido, `Bearer ${segredo}`)) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const db = supabaseAdmin();
  const opcoes = { retencaoEnv: process.env.RETENCAO_ENABLED, ambienteApp: ambienteAtual() };
  try {
    if (process.env.RETENCAO_ENABLED === "true") {
      try {
        return NextResponse.json(await executarRetencao(db, { ...opcoes, simular: false }));
      } catch (e) {
        if (!(e instanceof Error && e.message.startsWith("Retenção: execução real recusada"))) throw e;
      }
    }
    return NextResponse.json(await executarRetencao(db, { ...opcoes, simular: true }));
  } catch (e) {
    console.error("Erro na retenção agendada:", e instanceof Error ? e.message : "erro");
    return NextResponse.json({ erro: "Não foi possível executar a rotina de retenção." }, { status: 500 });
  }
}
