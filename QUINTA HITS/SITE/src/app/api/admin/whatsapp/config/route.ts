import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/adminSessao";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tabelaAusente } from "@/lib/disponibilidade";
import { registrarAuditoria } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/** GET — situação dos interruptores do agente (só leitura, exceto a pausa de emergência). */
export async function GET() {
  const negado = await exigirSessao();
  if (negado) return negado;
  const { data, error } = await supabaseAdmin().from("wa_config").select("ambiente, agente_ativo, envio_ativo, pausa_emergencia, restringir_a_numeros_teste").eq("id", 1).maybeSingle();
  if (tabelaAusente(error)) return NextResponse.json({ migrado: false });
  if (error) return NextResponse.json({ erro: "Não foi possível ler a configuração." }, { status: 500 });
  return NextResponse.json({ migrado: true, config: data });
}

/**
 * PUT — corpo `{ pausa_emergencia: boolean }`. A pausa derruba o agente E todo envio na hora, sem redeploy.
 * Ligar o agente e o envio NÃO é feito por aqui nesta fase: só a pausa.
 */
export async function PUT(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const body = await req.json().catch(() => null);
  if (typeof body?.pausa_emergencia !== "boolean") return NextResponse.json({ erro: 'Envie { "pausa_emergencia": true|false }.' }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("wa_config").update({ pausa_emergencia: body.pausa_emergencia, updated_at: new Date().toISOString() }).eq("id", 1).select("pausa_emergencia").maybeSingle();
  if (tabelaAusente(error)) return NextResponse.json({ erro: "A migração do agente ainda não foi aplicada neste banco." }, { status: 503 });
  if (error || !data) return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  await registrarAuditoria({ ator: "admin", acao: body.pausa_emergencia ? "pausa_emergencia_ativada" : "pausa_emergencia_desativada", entidade: "wa_config", entidadeId: "1" });
  return NextResponse.json({ ok: true, pausa_emergencia: (data as { pausa_emergencia: boolean }).pausa_emergencia });
}
