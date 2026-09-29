import { NextResponse } from "next/server";
import { mapaDaEdicao } from "@/lib/reservas";
import { edicaoProntaParaSite } from "@/lib/regras";
import { estadoDasReservasDoSite } from "@/lib/reservasSite";
import { carregarPlanta } from "@/lib/plantaBanco";

export const dynamic = "force-dynamic";

/** GET /api/reservas/mapa?edicao=AAAA-MM-DD — mesas da casa, quais já estão ocupadas nessa edição e a planta do salão. */
export async function GET(req: Request) {
  const edicaoId = new URL(req.url).searchParams.get("edicao") ?? "";
  if (!estadoDasReservasDoSite().aberto) return NextResponse.json({ erro: "As reservas online abrirão em breve." }, { status: 503 });
  try {
    if (!(await edicaoProntaParaSite(edicaoId))) {
      return NextResponse.json({ erro: "Essa edição não está aberta para reservas." }, { status: 404 });
    }
    const [mapa, planta] = await Promise.all([mapaDaEdicao(edicaoId), carregarPlanta().catch(() => ({ elementos: [] }))]);
    return NextResponse.json({ ...mapa, planta: planta.elementos }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: "Não foi possível carregar o mapa." }, { status: 500 });
  }
}
