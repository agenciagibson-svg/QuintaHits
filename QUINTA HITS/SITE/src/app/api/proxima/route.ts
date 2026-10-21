import { NextResponse } from "next/server";
import { hojeISO, inicioDaEdicao, proximaEdicao } from "@/lib/programacao";
import { getSiteConfig, reservaHrefFrom } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

/**
 * GET /api/proxima — o próximo evento cadastrado (canceladas puladas), com contagem em segundos e link de reserva.
 * Sem evento futuro na agenda: `edicao: null` (e sem contagem).
 */
export async function GET() {
  const agora = new Date();
  const site = await getSiteConfig();
  const edicao = await proximaEdicao(agora);
  const inicio = edicao ? inicioDaEdicao(edicao.data, edicao.horario, site.horarioPadrao) : null;
  return NextResponse.json(
    {
      hoje: hojeISO(agora),
      ehHoje: !!edicao && hojeISO(agora) === edicao.data,
      edicao,
      inicio: inicio ? inicio.toISOString() : null,
      segundosRestantes: inicio ? Math.max(0, Math.floor((inicio.getTime() - agora.getTime()) / 1000)) : null,
      casa: site.casa.nome,
      reserva: new URL(reservaHrefFrom(site), site.url).toString(),
      assinatura: site.assinatura,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
