import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { site, instagramUrl } from "@/config/site";

export type SiteConfig = typeof site;

/**
 * Retorna o objeto `site` com os campos editáveis pelo painel admin
 * (endereço/bairro/instagram da casa, link de reserva, horário padrão)
 * sobrescritos pelo que estiver salvo no Supabase. Em caso de erro ou
 * linha vazia, cai de volta nos valores estáticos de src/config/site.ts.
 */
export async function getSiteConfig(): Promise<SiteConfig> {
  const { data, error } = await supabaseAdmin()
    .from("site_config")
    .select("casa_endereco, casa_bairro, casa_instagram, reserva_url, horario_padrao")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("Erro ao buscar site_config:", error.message);
    return site;
  }

  return {
    ...site,
    casa: {
      ...site.casa,
      endereco: data.casa_endereco || site.casa.endereco,
      bairro: data.casa_bairro || site.casa.bairro,
      instagram: data.casa_instagram || site.casa.instagram,
    },
    reservaUrl: data.reserva_url || site.reservaUrl,
    horarioPadrao: data.horario_padrao || site.horarioPadrao,
  };
}

/** Mesma lógica de reservaHref() de config/site.ts, mas a partir de um SiteConfig já resolvido. */
export function reservaHrefFrom(cfg: SiteConfig): string {
  return cfg.reservaUrl || instagramUrl(cfg.instagram);
}
