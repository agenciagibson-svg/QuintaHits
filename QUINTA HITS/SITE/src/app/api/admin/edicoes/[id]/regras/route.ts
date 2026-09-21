import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/adminSessao";
import { dataISOValida } from "@/lib/edicao";
import { carregarPainelDeRegras, salvarRegrasECanais, validarCanais } from "@/lib/regras";
import { validarRegras } from "@/lib/regrasEdicao";

export const dynamic = "force-dynamic";

const erro = (mensagem: string, status: number) => NextResponse.json({ erro: mensagem }, { status });

/**
 * GET /api/admin/edicoes/:id/regras — regras da edição, canais de cada mesa e se ela está pronta para o atendimento
 * automático. Sem a migração aplicada neste banco devolve `{ migrado: false }` (o painel mostra um aviso).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const { id } = await params;
  if (!dataISOValida(id)) return erro("Edição inválida.", 400);
  try {
    return NextResponse.json(await carregarPainelDeRegras(id));
  } catch (e) {
    console.error("Erro ao carregar regras:", e instanceof Error ? e.message : "erro");
    return erro("Não foi possível carregar as regras.", 500);
  }
}

/** PUT /api/admin/edicoes/:id/regras — corpo `{ regras?: {...}, mesas?: [{ mesa_id, disponivel_site, ... }] }`. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const { id } = await params;
  if (!dataISOValida(id)) return erro("Edição inválida.", 400);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return erro("Pedido inválido.", 400);

  const regras = body.regras === undefined ? undefined : validarRegras(body.regras);
  if (regras && "erro" in regras) return erro(regras.erro, 400);
  const canais = body.mesas === undefined ? undefined : validarCanais(body.mesas);
  if (canais && "erro" in canais) return erro(canais.erro, 400);

  try {
    const r = await salvarRegrasECanais(id, { regras: regras?.campos, canais: canais?.itens });
    if (!r.ok) return erro(r.erro, r.status);
    return NextResponse.json(await carregarPainelDeRegras(id));
  } catch (e) {
    console.error("Erro ao salvar regras:", e instanceof Error ? e.message : "erro");
    return erro("Não foi possível salvar.", 500);
  }
}
