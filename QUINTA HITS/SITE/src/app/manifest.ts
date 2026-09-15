import type { MetadataRoute } from "next";
import { site } from "@/config/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.nome,
    short_name: site.nome,
    description: site.descricao,
    start_url: "/",
    display: "standalone",
    background_color: "#17352B",
    theme_color: "#17352B",
    lang: "pt-BR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
