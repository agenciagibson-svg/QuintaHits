import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditarPainel, exigirSessao } from "@/lib/adminSessao";
import { erroInterno } from "@/lib/respostas";
import { validarAberturaSemanal, validarConfig } from "@/lib/adminValidacao";
import { colunasAberturaAusentes } from "@/lib/aberturaSemanal";

export const dynamic = "force-dynamic";

const CAMPOS = "casa_endereco, casa_bairro, casa_instagram, reserva_url, horario_padrao";
const CAMPOS_ABERTURA = "reservas_abrem_dia, reservas_abrem_hora";

/**
 * GET /api/admin/config — linha única de configuração editável do site. `abertura_migrada: false` = o banco ainda não
 * tem as colunas da abertura semanal das reservas (o painel avisa e não envia esses campos).
 */
export async function GET() {
  const negado = await exigirSessao();
  if (negado) return negado;

  const db = supabaseAdmin();
  const { data, error } = await db.from("site_config").select(CAMPOS).eq("id", 1).maybeSingle();
  if (error) return NextResponse.json({ erro: erroInterno(error) }, { status: 500 });

  const abertura = await db.from("site_config").select(CAMPOS_ABERTURA).eq("id", 1).maybeSingle();
  if (abertura.error && !colunasAberturaAusentes(abertura.error)) return NextResponse.json({ erro: erroInterno(abertura.error) }, { status: 500 });
  const aberturaMigrada = !abertura.error;

  return NextResponse.json({
    config: { ...(data ?? {}), ...(aberturaMigrada ? (abertura.data ?? {}) : {}), abertura_migrada: aberturaMigrada },
  });
}

/** PUT /api/admin/config — atualiza os campos enviados (cria a linha única se ainda não existir). */
export async function PUT(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const validacao = validarConfig(body);
  if ("erro" in validacao) return NextResponse.json({ erro: validacao.erro }, { status: 400 });
  const abertura = validarAberturaSemanal(body);
  if ("erro" in abertura) return NextResponse.json({ erro: abertura.erro }, { status: 400 });

  const campos = { ...validacao.campos, ...(abertura.campos ?? {}) };
  const { data, error } = await supabaseAdmin()
    .from("site_config")
    .upsert({ id: 1, ...campos, updated_at: new Date().toISOString() })
    .select()
    .single();

  if (abertura.campos && colunasAberturaAusentes(error)) {
    return NextResponse.json({ erro: "A migração da abertura semanal ainda não foi aplicada neste banco (migracao-2026-10-05-abertura-semanal.sql)." }, { status: 503 });
  }
  if (error) return NextResponse.json({ erro: erroInterno(error) }, { status: 500 });

  revalidatePath("/", "layout");
  await auditarPainel("config_site_atualizada", "site_config", "1", { campos: Object.keys(campos) });
  return NextResponse.json({ config: data });
}
