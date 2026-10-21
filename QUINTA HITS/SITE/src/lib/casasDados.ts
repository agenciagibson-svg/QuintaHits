import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hojeISO, type Edicao } from "@/lib/edicao";
import type { CasaId } from "@/config/casas";

/**
 * Dados públicos de uma casa que não é a Quinta Hits (endereço, cidade, quando, Instagram) e a agenda dela no site.
 * Nada aqui pode derrubar a home ou a programação da Quinta Hits: erro de banco (ou banco sem a migração de 21/10)
 * vira dados vazios ("Em breve") e agenda vazia.
 */
export type DadosCasa = { endereco: string; bairro: string; cidade: string; quando: string; instagram: string };

export const DADOS_VAZIOS: DadosCasa = { endereco: "", bairro: "", cidade: "", quando: "", instagram: "" };

export const CAMPOS_DADOS_CASA = ["endereco", "bairro", "cidade", "quando", "instagram"] as const;

export async function dadosDaCasa(casa: CasaId): Promise<DadosCasa> {
  try {
    const { data, error } = await supabaseAdmin().from("casas").select(CAMPOS_DADOS_CASA.join(", ")).eq("id", casa).maybeSingle();
    if (error || !data) return { ...DADOS_VAZIOS };
    const d = data as unknown as Partial<DadosCasa>;
    return Object.fromEntries(CAMPOS_DADOS_CASA.map((c) => [c, typeof d[c] === "string" ? d[c] : ""])) as DadosCasa;
  } catch {
    return { ...DADOS_VAZIOS };
  }
}

/** Link do Google Maps a partir do endereço; sem endereço, null (o site não mostra "Abrir no mapa"). */
export function mapsUrlDe(d: DadosCasa, nome: string): string | null {
  if (!d.endereco) return null;
  const busca = [nome, d.endereco, d.bairro, d.cidade].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(busca)}`;
}

/** Próximos eventos da casa (de hoje em diante, sem os cancelados), do mais próximo ao mais distante. */
export async function proximosEventosDaCasa(casa: CasaId, agora = new Date(), limite = 4): Promise<Edicao[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("edicoes")
      .select("id, data, artista, instagram, tema, genero, horario, local, status, destaque, casa")
      .eq("casa", casa)
      .gte("data", hojeISO(agora))
      .in("status", ["confirmada", "a_confirmar"])
      .order("data", { ascending: true })
      .limit(limite);
    if (error) return [];
    return (data ?? []) as Edicao[];
  } catch {
    return [];
  }
}
