import { site } from "@/config/site";

/**
 * Manifest do site público. É uma rota (e não o arquivo especial app/manifest.ts) de propósito: o arquivo especial
 * força o mesmo <link rel="manifest"> em TODAS as páginas, inclusive no app da casa (/casa), que tem manifest próprio.
 * Assim, o layout raiz aponta para este e o layout de /casa troca pelo dele.
 */
export function GET() {
  const manifest = {
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
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
