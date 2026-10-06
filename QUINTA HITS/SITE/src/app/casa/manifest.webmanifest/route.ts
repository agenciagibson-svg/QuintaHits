import { site } from "@/config/site";

/** Manifest do app da casa (instalável), separado do manifest do site público: abre direto em /casa e fica só nele. */
export function GET() {
  const manifest = {
    id: "/casa",
    name: `Reservas · ${site.casa.nome}`,
    short_name: "Reservas QH",
    description: `Pedidos de mesa da ${site.nome} no ${site.casa.nome}.`,
    start_url: "/casa",
    scope: "/casa",
    display: "standalone",
    orientation: "portrait",
    background_color: "#17352B",
    theme_color: "#17352B",
    lang: "pt-BR",
    icons: [
      { src: "/casa/icones/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/casa/icones/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/casa/icones/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
