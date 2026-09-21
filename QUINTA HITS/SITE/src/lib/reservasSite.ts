import "server-only";
import { reservasSiteLigadoPorEnv } from "@/lib/agente/ambiente";
import { whatsappConfigurado } from "@/lib/whatsapp";

/**
 * A reserva pelo site está aberta? Duas condições, nesta ordem:
 *  1. RESERVAS_SITE_ENABLED=true (chave própria; sozinha as credenciais do WhatsApp nunca abrem o site);
 *  2. a confirmação pelo WhatsApp precisa poder ser enviada (credenciais + envio real permitido), senão o cliente
 *     reservaria e nunca receberia a confirmação.
 * Com a chave desligada NENHUMA credencial é consultada: o site não depende delas para mostrar "em breve".
 */
export type EstadoReservasSite = { aberto: boolean; motivo: "chave_desligada" | "whatsapp_nao_configurado" | "ok" };

export function estadoDasReservasDoSite(): EstadoReservasSite {
  if (!reservasSiteLigadoPorEnv()) return { aberto: false, motivo: "chave_desligada" };
  if (!whatsappConfigurado()) return { aberto: false, motivo: "whatsapp_nao_configurado" };
  return { aberto: true, motivo: "ok" };
}
