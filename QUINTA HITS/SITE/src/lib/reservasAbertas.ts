import "server-only";
import { cache } from "react";
import { situacaoDoSite } from "@/lib/regras";
import { estadoDasReservasDoSite } from "@/lib/reservasSite";
import { CASAS, CASA_IDS } from "@/config/casas";

/**
 * Ids das noites que aceitam reserva pelo site AGORA (todas as casas): chave do site, noite completa e liberada no
 * painel, prazo e abertura. É o que decide se o card da agenda mostra "Reservar mesa" (com o link DAQUELA noite) ou
 * "Reservas em breve". Uma consulta por página (cache da requisição); erro de banco = nenhuma aberta.
 */
export const noitesComReservaAberta = cache(async (agora = new Date()): Promise<string[]> => {
  const ids: string[] = [];
  for (const casa of CASA_IDS.filter((c) => CASAS[c].reservas)) {
    if (!estadoDasReservasDoSite(casa).aberto) continue;
    const { prontas } = await situacaoDoSite(agora, 30, casa).catch(() => ({ prontas: [] }));
    ids.push(...prontas.map((p) => p.edicao.id));
  }
  return ids;
});
