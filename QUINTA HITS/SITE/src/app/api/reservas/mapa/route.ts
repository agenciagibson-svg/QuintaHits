import { NextResponse } from "next/server";
import { edicaoReservavel, mapaDaEdicao } from "@/lib/reservas";

export const dynamic = "force-dynamic";

/** GET /api/reservas/mapa?edicao=AAAA-MM-DD — mesas da casa e quais já estão ocupadas nessa edição. */
export async function GET(req: Request) {
  const edicaoId = new URL(req.url).searchParams.get("edicao") ?? "";
  try {
    if (!(await edicaoReservavel(edicaoId))) {
      return NextResponse.json({ erro: "Essa edição não está aberta para reservas." }, { status: 404 });
    }
    return NextResponse.json(await mapaDaEdicao(edicaoId), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: "Não foi possível carregar o mapa." }, { status: 500 });
  }
}
