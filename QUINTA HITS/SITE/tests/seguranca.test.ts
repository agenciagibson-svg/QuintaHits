import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import robots from "@/app/robots";
import { site } from "@/config/site";

describe("cabeçalhos de segurança e robots", () => {
  it("todas as páginas levam os cabeçalhos de segurança; o painel nunca é guardado em cache", async () => {
    const regras = await nextConfig.headers!();
    const todas = Object.fromEntries((regras.find((r) => r.source === "/(.*)")?.headers ?? []).map((h) => [h.key, h.value]));
    expect(todas["X-Content-Type-Options"]).toBe("nosniff");
    expect(todas["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(todas["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    // Câmera: bloqueada no site todo, liberada (só para o próprio site) no app da casa, para ler o QR na porta.
    const politica = (fonte: string) => regras.find((r) => r.source === fonte)?.headers.find((h) => h.key === "Permissions-Policy")?.value;
    expect(politica("/:caminho((?!casa(?:/|$)).*)")).toContain("camera=()");
    expect(politica("/casa")).toContain("camera=(self)");
    expect(politica("/casa/:path*")).toContain("camera=(self)");
    const fora = new RegExp("^/((?!casa(?:/|$)).*)$");
    for (const c of ["/", "/reservar", "/admin", "/harley-grill", "/casas", "/minha-reserva/x"]) expect(fora.test(c), c).toBe(true);
    for (const c of ["/casa", "/casa/checkin/x"]) expect(fora.test(c), c).toBe(false);
    const painel = regras.find((r) => r.source.includes("admin"));
    expect(painel?.headers).toEqual([{ key: "Cache-Control", value: "no-store" }]);
  });

  it("robots.txt esconde /admin e /api, libera o resto e aponta o sitemap", () => {
    const r = robots();
    expect(r.rules).toEqual([{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] }]);
    expect(r.sitemap).toBe(`${site.url}/sitemap.xml`);
  });
});
