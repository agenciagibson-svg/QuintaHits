import { NextResponse } from "next/server";
import { hojeISO, inicioProximaQuinta, proximaEdicao } from "@/lib/programacao";
import { site, reservaHref } from "@/config/site";

export const dynamic = "force-dynamic";

/** GET /api/proxima — a próxima quinta, com contagem em segundos e link de reserva. */
export function GET() {
  const agora = new Date();
  const edicao = proximaEdicao(agora);
  const inicio = inicioProximaQuinta(agora);
  return NextResponse.json(
    {
      hoje: hojeISO(agora),
      ehHoje: hojeISO(agora) === edicao.data,
      edicao,
      inicio: inicio.toISOString(),
      segundosRestantes: Math.max(0, Math.floor((inicio.getTime() - agora.getTime()) / 1000)),
      casa: site.casa.nome,
      reserva: reservaHref(),
      assinatura: site.assinatura,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
