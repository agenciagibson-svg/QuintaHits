import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/adminSessao";
import { assumir, devolverAoAgente, encerrarAtendimento, enviarComoAtendente, historicoDaTransferencia, nomeDeAtendenteValido } from "@/lib/agente/atendimento";
import { agendarDepois } from "@/lib/agente/depois";
import { processarFila } from "@/lib/agente/fila";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const erro = (mensagem: string, status: number) => NextResponse.json({ erro: mensagem }, { status });

/** GET /api/admin/whatsapp/atendimento/:id — histórico da conversa da transferência. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const { id } = await params;
  if (!UUID_RE.test(id)) return erro("Atendimento inválido.", 400);
  try {
    const mensagens = await historicoDaTransferencia(id);
    if (!mensagens) return erro("Atendimento não encontrado.", 404);
    return NextResponse.json({ mensagens });
  } catch (e) {
    console.error("Erro ao ler histórico:", e instanceof Error ? e.message : "erro");
    return erro("Não foi possível carregar o histórico.", 500);
  }
}

/**
 * POST /api/admin/whatsapp/atendimento/:id — corpo `{ acao: "assumir" | "devolver" | "encerrar" | "enviar", atendente, texto? }`.
 * O cookie de sessão não guarda identidade, então o atendente informa o próprio nome (fica na auditoria).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const { id } = await params;
  if (!UUID_RE.test(id)) return erro("Atendimento inválido.", 400);

  const body = await req.json().catch(() => null);
  const atendente = nomeDeAtendenteValido(body?.atendente);
  if (!atendente) return erro("Informe o seu nome (de 2 a 60 caracteres).", 400);

  try {
    switch (body?.acao) {
      case "assumir": {
        const r = await assumir(id, atendente);
        if (r === "ja_assumida") return erro("Outra pessoa já assumiu este atendimento.", 409);
        if (r === "nao_encontrada") return erro("Atendimento não encontrado ou já finalizado.", 404);
        return NextResponse.json({ ok: true });
      }
      case "devolver": {
        const r = await devolverAoAgente(id, atendente);
        return r === "ok" ? NextResponse.json({ ok: true }) : erro("Atendimento não encontrado ou já finalizado.", 404);
      }
      case "encerrar": {
        const r = await encerrarAtendimento(id, atendente);
        return r === "ok" ? NextResponse.json({ ok: true }) : erro("Atendimento não encontrado ou já finalizado.", 404);
      }
      case "enviar": {
        if (typeof body.texto !== "string") return erro("Escreva a mensagem.", 400);
        const r = await enviarComoAtendente(id, atendente, body.texto);
        if (r === "invalido") return erro("A mensagem precisa ter de 1 a 1000 caracteres.", 400);
        if (r === "nao_esta_com_voce") return erro("Assuma o atendimento antes de responder.", 409);
        agendarDepois(() => processarFila());
        return NextResponse.json({ ok: true, enfileirada: true });
      }
      default:
        return erro("Ação inválida.", 400);
    }
  } catch (e) {
    console.error("Erro na ação de atendimento:", e instanceof Error ? e.message : "erro");
    return erro("Não foi possível concluir a ação.", 500);
  }
}
