import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirSessaoCasa } from "@/lib/casaSessao";
import { hojeISO } from "@/lib/edicao";
import { expirarPedidosVencidos } from "@/lib/reservas";

export const dynamic = "force-dynamic";

/** Quantas quintas à frente o app da casa mostra. */
const QUINTAS = 6;

/**
 * GET /api/casa/reservas — tudo o que o app da casa mostra, numa chamada só: as próximas quintas (de hoje em diante,
 * sem as canceladas), os pedidos de cada uma e o número das mesas. Só o necessário para atender: nada de regras internas,
 * configuração, auditoria ou WhatsApp oficial.
 */
export async function GET() {
  const negado = await exigirSessaoCasa();
  if (negado) return negado;

  try {
    await expirarPedidosVencidos();
    const db = supabaseAdmin();
    const ed = await db
      .from("edicoes")
      .select("id, data, artista, horario, local, status")
      .gte("data", hojeISO())
      .neq("status", "cancelada")
      .order("data", { ascending: true })
      .limit(QUINTAS);
    if (ed.error) throw ed.error;
    const edicoes = ed.data ?? [];
    const ids = edicoes.map((e) => e.id as string);

    const [res, mes] = await Promise.all([
      ids.length
        ? db
            .from("reservas")
            .select("id, edicao_id, mesa_id, nome, whatsapp, pessoas, status, codigo, created_at")
            .in("edicao_id", ids)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      db.from("mesas").select("id, numero, lugares, area").order("numero"),
    ]);
    if (res.error) throw res.error;
    if (mes.error) throw mes.error;

    const reservas = res.data ?? [];
    return NextResponse.json({
      edicoes,
      reservas,
      mesas: mes.data ?? [],
      pendentes: reservas.filter((r) => r.status === "aguardando").length,
    });
  } catch (e) {
    console.error("Erro ao carregar reservas da casa:", (e as { code?: string })?.code ?? "erro");
    return NextResponse.json({ erro: "Não foi possível carregar as reservas." }, { status: 500 });
  }
}
