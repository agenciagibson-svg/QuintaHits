import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { plantaDoBanco, type ElementoSalao } from "@/lib/planta";

/** Elementos do salão salvos. Sem a migração da planta (coluna ausente) ou com erro: lista vazia, e o mapa segue funcionando. */
export async function carregarPlanta(): Promise<{ migrado: boolean; elementos: ElementoSalao[] }> {
  const { data, error } = await supabaseAdmin().from("site_config").select("planta").eq("id", 1).maybeSingle();
  if (error) return { migrado: false, elementos: [] };
  return { migrado: true, elementos: plantaDoBanco((data as { planta?: unknown } | null)?.planta) };
}
