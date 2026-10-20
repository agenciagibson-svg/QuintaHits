import "server-only";
import { reservasSiteLigadoPorEnv, reservasSiteManualPorEnv } from "@/lib/agente/ambiente";
import { whatsappConfigurado } from "@/lib/whatsapp";
import { CASA_PADRAO, dataDaEdicaoId, type CasaId } from "@/config/casas";

/**
 * A reserva pelo site está aberta? Nesta ordem:
 *  1. RESERVAS_SITE_ENABLED=true (chave própria; sozinha as credenciais do WhatsApp nunca abrem o site);
 *  2. com o WhatsApp conectado (credenciais + envio real permitido): fluxo automático, o cliente confirma mandando o código;
 *  3. sem WhatsApp, só abre com RESERVAS_SITE_MANUAL=true: o pedido vai para o painel e a equipe confirma à mão.
 *     Sem nenhum dos dois o site fica fechado, senão o cliente reservaria e ninguém confirmaria.
 * Com a chave do site desligada NENHUMA credencial é consultada: o site não depende delas para mostrar "em breve".
 *
 * Outras casas (ex.: Harley Grill): a mesma chave RESERVAS_SITE_ENABLED abre ou fecha, e o pedido é SEMPRE no modo
 * formulário (a equipe confirma no painel). O WhatsApp automático é só da Quinta Hits.
 */
export type EstadoReservasSite = { aberto: boolean; motivo: "chave_desligada" | "whatsapp_nao_configurado" | "ok" | "manual" };

export function estadoDasReservasDoSite(casa: CasaId = CASA_PADRAO): EstadoReservasSite {
  if (!reservasSiteLigadoPorEnv()) return { aberto: false, motivo: "chave_desligada" };
  if (casa !== CASA_PADRAO) return { aberto: true, motivo: "manual" };
  if (whatsappConfigurado()) return { aberto: true, motivo: "ok" };
  if (reservasSiteManualPorEnv()) return { aberto: true, motivo: "manual" };
  return { aberto: false, motivo: "whatsapp_nao_configurado" };
}

/** Pedido manual segura a mesa até o fim do dia da edição (horário de Uberlândia); sem resposta da equipe, expira sozinho. */
export function fimDoDiaDaEdicao(edicaoId: string): string {
  return new Date(`${dataDaEdicaoId(edicaoId)}T23:59:00-03:00`).toISOString();
}
