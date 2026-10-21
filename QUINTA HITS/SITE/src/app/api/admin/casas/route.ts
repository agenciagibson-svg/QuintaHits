import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditarPainel, exigirSessao } from "@/lib/adminSessao";
import { erroInterno } from "@/lib/respostas";
import { CASA_PADRAO, casaDoParametro } from "@/config/casas";
import { CAMPOS_DADOS_CASA, dadosDaCasa } from "@/lib/casasDados";

export const dynamic = "force-dynamic";

const erro = (mensagem: string, status: number) => NextResponse.json({ erro: mensagem }, { status });

/** Casa da URL; a Quinta Hits não passa por aqui (os dados dela ficam em /api/admin/config). */
function casaDaUrl(req: Request) {
  const casa = casaDoParametro(new URL(req.url).searchParams.get("casa"));
  return casa && casa !== CASA_PADRAO ? casa : null;
}

/** GET /api/admin/casas?casa=harley-grill — endereço, bairro, cidade, quando e Instagram da casa. */
export async function GET(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const casa = casaDaUrl(req);
  if (!casa) return erro("Casa inválida.", 400);
  return NextResponse.json({ dados: await dadosDaCasa(casa) });
}

/** PUT /api/admin/casas?casa=harley-grill — grava os campos enviados (texto, até 120 caracteres; Instagram sem @). */
export async function PUT(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const casa = casaDaUrl(req);
  if (!casa) return erro("Casa inválida.", 400);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return erro("Corpo inválido.", 400);
  const campos: Record<string, string> = {};
  for (const c of CAMPOS_DADOS_CASA) {
    const v = (body as Record<string, unknown>)[c];
    if (v === undefined) continue;
    if (typeof v !== "string" || v.trim().length > 120) return erro(`Campo "${c}" inválido (até 120 caracteres).`, 400);
    campos[c] = c === "instagram" ? v.trim().replace(/^@/, "") : v.trim();
  }
  if (Object.keys(campos).length === 0) return erro("Nada para salvar.", 400);

  const { error } = await supabaseAdmin().from("casas").update({ ...campos, updated_at: new Date().toISOString() }).eq("id", casa);
  if (error?.code === "42703" || error?.code === "PGRST204") {
    return erro("Aplique a migração dos dados das casas (migracao-2026-10-21-dados-das-casas.sql) no Supabase.", 503);
  }
  if (error) return erro(erroInterno(error), 500);

  revalidatePath("/", "layout");
  await auditarPainel("dados_casa_atualizados", "casa", casa, { campos: Object.keys(campos) });
  return NextResponse.json({ dados: await dadosDaCasa(casa) });
}
