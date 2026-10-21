import { NextResponse } from "next/server";
import { atorDaSessao, exigirSessao } from "@/lib/adminSessao";
import { registrarChegada } from "@/lib/checkin";
import { CASA_IDS } from "@/config/casas";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/checkin — `{ ref, acao? }`: chegada marcada pelo painel (botão "Chegou" na lista da noite).
 * Qualquer casa; também corrige noites que já passaram (para o comparecimento ficar certo).
 */
export async function POST(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const body = await req.json().catch(() => null);
  const acao = body?.acao === "desfazer" || body?.acao === "nao_veio" ? body.acao : "chegou";
  try {
    const r = await registrarChegada(body?.ref, await atorDaSessao(), { casas: CASA_IDS, acao, qualquerNoite: true });
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status });
    return NextResponse.json({ reserva: r.reserva, jaTinhaChegado: r.jaTinhaChegado });
  } catch (e) {
    console.error("Erro no check-in:", (e as { code?: string })?.code ?? "erro");
    return NextResponse.json({ erro: "Não foi possível registrar." }, { status: 500 });
  }
}
