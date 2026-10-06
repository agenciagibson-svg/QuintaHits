import { NextResponse } from "next/server";
import { atorDaCasa, exigirSessaoCasa } from "@/lib/casaSessao";
import { chavePublicaPush, removerInscricao, salvarInscricao, validarInscricao } from "@/lib/pushCasa";

export const dynamic = "force-dynamic";

/** GET /api/casa/push — avisos disponíveis neste servidor? (chave pública VAPID para o celular se inscrever). */
export async function GET() {
  const negado = await exigirSessaoCasa();
  if (negado) return negado;
  const chave = chavePublicaPush();
  return NextResponse.json({ disponivel: !!chave, chavePublica: chave });
}

/** POST /api/casa/push — `{ inscricao }` do navegador: este celular passa a receber aviso de pedido novo. */
export async function POST(req: Request) {
  const negado = await exigirSessaoCasa();
  if (negado) return negado;
  if (!chavePublicaPush()) return NextResponse.json({ erro: "Avisos ainda não configurados." }, { status: 503 });
  const body = await req.json().catch(() => null);
  const insc = validarInscricao(body?.inscricao);
  if (!insc) return NextResponse.json({ erro: "Inscrição inválida." }, { status: 400 });
  const r = await salvarInscricao(insc, await atorDaCasa());
  if (r === "sem_tabela") return NextResponse.json({ erro: "Avisos ainda não ativados no banco (migração do app da casa)." }, { status: 503 });
  if (r === "erro") return NextResponse.json({ erro: "Não foi possível ativar os avisos." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/casa/push — `{ endpoint }`: este celular para de receber avisos. */
export async function DELETE(req: Request) {
  const negado = await exigirSessaoCasa();
  if (negado) return negado;
  const body = await req.json().catch(() => null);
  if (typeof body?.endpoint !== "string" || body.endpoint.length > 1000) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  await removerInscricao(body.endpoint, await atorDaCasa()).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
