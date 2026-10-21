import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { casasDaSessao, exigirSessaoCasa } from "@/lib/casaSessao";
import { noitesEmAndamento } from "@/lib/checkin";
import { expirarPedidosVencidos } from "@/lib/reservas";
import { CASAS } from "@/config/casas";

export const dynamic = "force-dynamic";

/** Quantas noites à frente o app da casa mostra, por casa. */
const NOITES = 6;

type EdicaoLinha = { id: string; data: string; artista: string; horario: string; local: string; status: string; casa: string };

/**
 * GET /api/casa/reservas — tudo o que o app da casa mostra, numa chamada só: as próximas noites (de hoje em diante,
 * sem as canceladas) das casas de quem está no app, os pedidos de cada uma e o número das mesas. Só o necessário para
 * atender: nada de regras internas, configuração, auditoria ou WhatsApp oficial. A equipe vê todas as casas com
 * reserva pelo site; o dono do Florindos, só a Quinta Hits.
 */
export async function GET() {
  const negado = await exigirSessaoCasa();
  if (negado) return negado;

  try {
    const casas = await casasDaSessao();
    await expirarPedidosVencidos();
    const db = supabaseAdmin();
    // Uma consulta por casa: cada uma mostra as suas próximas noites (uma casa cheia de datas não esconde a outra).
    const porCasa = await Promise.all(
      casas.map((casa) =>
        db
          .from("edicoes")
          .select("id, data, artista, horario, local, status, casa")
          .eq("casa", casa)
          // De madrugada a noite de ontem continua na tela (check-in de quem chega depois da meia-noite).
          .gte("data", noitesEmAndamento()[0])
          .neq("status", "cancelada")
          .order("data", { ascending: true })
          .limit(NOITES),
      ),
    );
    const falhou = porCasa.find((r) => r.error);
    if (falhou?.error) throw falhou.error;
    const ordem = (c: string) => casas.indexOf(c as (typeof casas)[number]);
    const edicoes = porCasa
      .flatMap((r) => (r.data ?? []) as EdicaoLinha[])
      .sort((a, b) => a.data.localeCompare(b.data) || ordem(a.casa) - ordem(b.casa));
    const ids = edicoes.map((e) => e.id);

    const [res, mes] = await Promise.all([
      ids.length
        ? db
            .from("reservas")
            .select("id, edicao_id, mesa_id, nome, whatsapp, pessoas, status, codigo, created_at, origem_reserva, observacoes, chegou_em")
            .in("edicao_id", ids)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      casas.length
        ? db.from("mesas").select("id, numero, lugares, area").in("casa", casas).order("numero")
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (res.error) throw res.error;
    if (mes.error) throw mes.error;

    const reservas = res.data ?? [];
    return NextResponse.json({
      casas: casas.map((c) => ({ id: c, nome: CASAS[c].nome })),
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
