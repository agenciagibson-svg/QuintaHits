import type { MetadataRoute } from "next";
import { site } from "@/config/site";

/** Painel e APIs não são conteúdo público: fora dos buscadores. O resto (inclusive /privacidade) fica aberto. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] }],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
