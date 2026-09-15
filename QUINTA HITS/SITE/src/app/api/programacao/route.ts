import { NextResponse } from "next/server";
import { edicoesAnteriores, proximasEdicoes } from "@/lib/programacao";
import { getSiteConfig } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

/**
 * GET /api/programacao?limite=6
 * Próximas quintas (com placeholders para as sem line-up) e edições anteriores.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limite = Math.min(Math.max(Number(url.searchParams.get("limite") ?? 6), 1), 26);
  const agora = new Date();
  const site = await getSiteConfig();
  return NextResponse.json(
    {
      label: site.nome,
      casa: site.casa.nome,
      cidade: `${site.cidade}/${site.uf}`,
      geradoEm: agora.toISOString(),
      proximas: await proximasEdicoes(agora, limite),
      anteriores: await edicoesAnteriores(agora),
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
