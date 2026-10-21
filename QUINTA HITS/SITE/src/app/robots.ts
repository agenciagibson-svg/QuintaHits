import type { MetadataRoute } from "next";
import { site } from "@/config/site";

/**
 * Painel, app da casa, APIs e páginas de reserva de cliente (QR) não são conteúdo público: fora dos buscadores.
 * O resto (inclusive /privacidade e as páginas das noites) fica aberto.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/casa", "/minha-reserva/", "/r/"] }],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
