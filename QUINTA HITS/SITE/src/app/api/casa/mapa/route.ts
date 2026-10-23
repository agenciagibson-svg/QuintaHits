import { NextResponse } from "next/server";
import { casasDaSessao, exigirSessaoCasa } from "@/lib/casaSessao";
import { estoqueDaEdicao, mesasDoCanal } from "@/lib/disponibilidade";
import { carregarPlanta } from "@/lib/plantaBanco";
import { casaDaEdicaoId, edicaoIdValido } from "@/config/casas";

export const dynamic = "force-dynamic";

/**
 * GET /api/casa/mapa?edicao=<id> — mapa da noite para o app da casa reservar ou travar mesa: as mesas que a equipe
 * pode ocupar (canal do painel), com posição, e a planta do salão. Quem está ocupando cada mesa o app já sabe pela
 * lista de reservas. Só noites das casas de quem está logado.
 */
export async function GET(req: Request) {
  const negado = await exigirSessaoCasa();
  if (negado) return negado;

  const edicaoId = new URL(req.url).searchParams.get("edicao");
  if (!edicaoIdValido(edicaoId)) return NextResponse.json({ erro: "Informe a noite." }, { status: 400 });
  const casa = casaDaEdicaoId(edicaoId);
  if (!(await casasDaSessao()).includes(casa)) return NextResponse.json({ erro: "Noite não encontrada." }, { status: 404 });

  try {
    const [estoque, planta] = await Promise.all([estoqueDaEdicao(edicaoId), carregarPlanta(casa).catch(() => ({ elementos: [] }))]);
    const mesas = mesasDoCanal(estoque, "admin").map((m) => ({ id: m.id, numero: m.numero, lugares: m.lugares, area: m.area, x: m.x, y: m.y }));
    return NextResponse.json({ casa, mesas, planta: planta.elementos }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("Erro ao carregar o mapa da casa:", (e as { code?: string })?.code ?? "erro");
    return NextResponse.json({ erro: "Não foi possível carregar o mapa." }, { status: 500 });
  }
}
