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
    expect(todas["Permissions-Policy"]).toContain("camera=()");
    const painel = regras.find((r) => r.source.includes("admin"));
    expect(painel?.headers).toEqual([{ key: "Cache-Control", value: "no-store" }]);
  });

  it("robots.txt esconde /admin e /api, libera o resto e aponta o sitemap", () => {
    const r = robots();
    expect(r.rules).toEqual([{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] }]);
    expect(r.sitemap).toBe(`${site.url}/sitemap.xml`);
  });
});
