import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { EventoWhatsapp } from "@/lib/whatsappEventos";
import { agenteLigadoPorEnv } from "./ambiente";
import type { DestinoEvento } from "./roteador";

export type ResultadoRegistro = "novo" | "repetido" | "indisponivel";

/** Chave de idempotência do evento: o wamid da mensagem, ou "wamid:status" nas atualizações de entrega. */
export const idDoEvento = (ev: EventoWhatsapp): string => (ev.tipo === "status" ? `${ev.wamid}:${ev.status}` : ev.wamid);

/**
 * Registra o evento na tabela de idempotência (wa_webhook_eventos): SEM conteúdo e SEM telefone do remetente.
 * "repetido" = a Meta reentregou; "indisponivel" = tabela ausente/erro (o chamador decide o que fazer).
 */
export async function registrarEventoWebhook(e: {
  id: string;
  tipo: "message" | "status";
  phoneNumberId: string | null;
  destino: DestinoEvento;
}): Promise<ResultadoRegistro> {
  if (!e.id) return "indisponivel";
  const { error } = await supabaseAdmin()
    .from("wa_webhook_eventos")
    .insert({ id: e.id, tipo: e.tipo, phone_number_id: e.phoneNumberId, destino: e.destino });
  if (!error) return "novo";
  if (error.code === "23505") return "repetido";
  console.error("Não foi possível registrar o evento do webhook:", error.code);
  return "indisponivel";
}

/**
 * Evento de outro número (ex.: o final 0200) ou sem número: NÃO é processado e NÃO gera resposta.
 * Fica só um registro sanitizado (ID do número e tipo). Grava no banco somente com o agente ligado por variável
 * de ambiente, porque isso pressupõe a migração aplicada; sem ele, fica apenas o log.
 */
export async function registrarIgnorado(ev: EventoWhatsapp, destino: Exclude<DestinoEvento, "quinta_hits">): Promise<void> {
  console.info("WhatsApp: evento ignorado", { destino, phone_number_id: ev.phoneNumberId, tipo: ev.tipo });
  if (!agenteLigadoPorEnv()) return;
  await registrarEventoWebhook({
    id: idDoEvento(ev),
    tipo: ev.tipo === "status" ? "status" : "message",
    phoneNumberId: ev.phoneNumberId,
    destino,
  }).catch(() => undefined);
}
