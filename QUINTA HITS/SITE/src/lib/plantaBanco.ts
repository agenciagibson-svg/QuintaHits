import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { plantaDoBanco, type ElementoSalao } from "@/lib/planta";
import { CASA_PADRAO, type CasaId } from "@/config/casas";

/**
 * Elementos do salão salvos para a casa. Quinta Hits: site_config (como sempre); outras casas: tabela `casas`.
 * Sem a migração (coluna/tabela ausente) ou com erro: lista vazia, e o mapa segue funcionando.
 */
export async function carregarPlanta(casa: CasaId = CASA_PADRAO): Promise<{ migrado: boolean; elementos: ElementoSalao[] }> {
  const consulta =
    casa === CASA_PADRAO
      ? supabaseAdmin().from("site_config").select("planta").eq("id", 1).maybeSingle()
      : supabaseAdmin().from("casas").select("planta").eq("id", casa).maybeSingle();
  const { data, error } = await consulta;
  if (error) return { migrado: false, elementos: [] };
  return { migrado: true, elementos: plantaDoBanco((data as { planta?: unknown } | null)?.planta) };
}
