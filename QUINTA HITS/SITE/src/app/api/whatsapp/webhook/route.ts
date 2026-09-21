import { assinaturaValida } from "@/lib/whatsapp";
import { tratarMensagemLegado } from "@/lib/whatsappLegado";
import { extrairEventos, type EventoWhatsapp } from "@/lib/whatsappEventos";
import { CODIGO_RE } from "@/lib/reserva";
import { idQuintaHitsParaRoteamento } from "@/lib/agente/ambiente";
import { classificarDestino } from "@/lib/agente/roteador";
import { registrarIgnorado } from "@/lib/agente/eventos";
import { tratarMensagemDoAgente, tratarStatusDoAgente } from "@/lib/agente/orquestrador";
import { processarFila } from "@/lib/agente/fila";
import { agendarDepois } from "@/lib/agente/depois";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET — verificação que a Meta faz uma vez, ao cadastrar o webhook. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === token) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Proibido", { status: 403 });
}

/**
 * POST — eventos recebidos pelo aplicativo. O callback é ÚNICO por aplicativo, então chegam eventos de todos os
 * números da conta. A separação é feita aqui, pelo `phone_number_id`:
 *   - 1352142871312651 (QUINTA HITS)  → tratado;
 *   - qualquer outro (ex.: o final 0200) ou ausente → NUNCA processado nem respondido, só registro sanitizado.
 *
 * Para o número da QUINTA HITS:
 *   1. mensagem com código QH-NNNNNN → fluxo atual (sempre tem prioridade);
 *   2. senão, agente ligado (variável E banco) e contato liberado → agente (as respostas só são ENFILEIRADAS);
 *   3. senão → comportamento atual (resposta padrão do fluxo do código).
 * O envio da fila roda DEPOIS de responder à Meta e continua desligado por padrão.
 */
export async function POST(req: Request) {
  const corpo = await req.text();
  if (!assinaturaValida(corpo, req.headers.get("x-hub-signature-256"))) {
    return new Response("Assinatura inválida", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(corpo);
  } catch {
    return new Response("ok", { status: 200 });
  }

  // Erro ao processar um evento não pode devolver erro à Meta: ela reenviaria tudo em loop.
  const idEsperado = idQuintaHitsParaRoteamento();
  let haRespostasNaFila = false;
  for (const evento of extrairEventos(payload)) {
    try {
      if (await rotear(evento, idEsperado)) haRespostasNaFila = true;
    } catch (e) {
      console.error("Erro ao tratar evento do WhatsApp:", e instanceof Error ? e.message : "erro desconhecido");
    }
  }
  if (haRespostasNaFila) agendarDepois(() => processarFila());
  return new Response("ok", { status: 200 });
}

/** Devolve true se o agente enfileirou respostas. */
async function rotear(evento: EventoWhatsapp, idEsperado: string | null): Promise<boolean> {
  const destino = classificarDestino(evento.phoneNumberId, idEsperado);
  if (destino !== "quinta_hits") {
    await registrarIgnorado(evento, destino);
    return false;
  }
  if (evento.tipo === "status") {
    await tratarStatusDoAgente(evento);
    return false;
  }

  const texto = evento.conteudo.forma === "texto" ? evento.conteudo.texto : null;
  const legado = () => tratarMensagemLegado({ de: evento.de, texto: texto ?? "", enviadaEm: evento.enviadaEm });

  // 1. Fluxo atual do código QH-NNNNNN: prioridade sempre, com o agente ligado ou não.
  if (texto !== null && CODIGO_RE.test(texto)) {
    await legado();
    return false;
  }

  // 2. Agente.
  const r = await tratarMensagemDoAgente(evento);
  if (r === "processado") return true;

  // 3. Agente desligado (ou banco sem a migração): tudo como sempre foi. Só texto tinha tratamento.
  if ((r === "desligado" || r === "sem_migracao") && texto !== null) await legado();
  return false;
}
