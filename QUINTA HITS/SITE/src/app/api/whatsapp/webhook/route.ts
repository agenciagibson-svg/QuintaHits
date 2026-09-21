import { assinaturaValida } from "@/lib/whatsapp";
import { tratarMensagemLegado } from "@/lib/whatsappLegado";
import { extrairEventos, type EventoWhatsapp } from "@/lib/whatsappEventos";
import { idQuintaHitsParaRoteamento } from "@/lib/agente/ambiente";
import { classificarDestino } from "@/lib/agente/roteador";
import { registrarIgnorado } from "@/lib/agente/eventos";

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
  for (const evento of extrairEventos(payload)) {
    try {
      await rotear(evento, idEsperado);
    } catch (e) {
      console.error("Erro ao tratar evento do WhatsApp:", e instanceof Error ? e.message : "erro desconhecido");
    }
  }
  return new Response("ok", { status: 200 });
}

async function rotear(evento: EventoWhatsapp, idEsperado: string | null) {
  const destino = classificarDestino(evento.phoneNumberId, idEsperado);
  if (destino !== "quinta_hits") {
    await registrarIgnorado(evento, destino);
    return;
  }
  // Atualizações de entrega e mensagens que não são texto: o fluxo atual não as usa.
  if (evento.tipo !== "mensagem" || evento.conteudo.forma !== "texto") return;

  await tratarMensagemLegado({ de: evento.de, texto: evento.conteudo.texto, enviadaEm: evento.enviadaEm });
}
