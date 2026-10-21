import { NextResponse } from "next/server";
import { atorDaCasa, casasDaSessao, exigirSessaoCasa } from "@/lib/casaSessao";
import { consultarNaPorta, registrarChegada } from "@/lib/checkin";
import { limiteExcedido } from "@/lib/limiteTaxa";

export const dynamic = "force-dynamic";

/**
 * POST /api/casa/checkin — `{ ref, acao? }`: check-in na porta pelo app da casa. `ref` = o que o QR trouxe (link com o id
 * da reserva) ou o código digitado (HG-482193). `acao`: "chegou" (padrão), "desfazer" ou "nao_veio".
 * Só as casas de quem está no app e só as noites em andamento (hoje; de madrugada, a de ontem).
 */
/** GET /api/casa/checkin?ref=… — só mostra a reserva (link do QR aberto fora do app): nada é registrado. */
export async function GET(req: Request) {
  const negado = await exigirSessaoCasa();
  if (negado) return negado;
  const ator = await atorDaCasa();
  if (limiteExcedido(`checkin:${ator}`, 60, 60_000)) return NextResponse.json({ erro: "Muitas leituras seguidas. Aguarde um instante." }, { status: 429 });
  try {
    const r = await consultarNaPorta(new URL(req.url).searchParams.get("ref"), await casasDaSessao());
    if (!r.ok) return NextResponse.json({ erro: r.erro, reserva: r.reserva ?? null }, { status: r.status });
    return NextResponse.json({ reserva: r.reserva, jaTinhaChegado: r.jaTinhaChegado });
  } catch {
    return NextResponse.json({ erro: "Não foi possível consultar. Tente de novo." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const negado = await exigirSessaoCasa();
  if (negado) return negado;
  const ator = await atorDaCasa();
  // Freio contra tentar códigos no chute: 60 leituras por minuto por pessoa sobram para a porta mais cheia.
  if (limiteExcedido(`checkin:${ator}`, 60, 60_000)) return NextResponse.json({ erro: "Muitas leituras seguidas. Aguarde um instante." }, { status: 429 });
  const body = await req.json().catch(() => null);
  const acao = body?.acao === "desfazer" || body?.acao === "nao_veio" ? body.acao : "chegou";
  try {
    const r = await registrarChegada(body?.ref, ator, { casas: await casasDaSessao(), acao });
    if (!r.ok) return NextResponse.json({ erro: r.erro, reserva: r.reserva ?? null }, { status: r.status });
    return NextResponse.json({ reserva: r.reserva, jaTinhaChegado: r.jaTinhaChegado });
  } catch (e) {
    console.error("Erro no check-in:", (e as { code?: string })?.code ?? "erro");
    return NextResponse.json({ erro: "Não foi possível registrar. Tente de novo." }, { status: 500 });
  }
}
