import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Privacidade, { metadata } from "@/app/privacidade/page";
import sitemap from "@/app/sitemap";
import { site } from "@/config/site";

const html = renderToStaticMarkup(Privacidade());
const texto = html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/\s+/g, " ");

describe("página /privacidade", () => {
  it("identifica a empresa e o local oficiais, sem citar outra casa", () => {
    expect(texto).toContain("GIBSON PROMOÇÕES");
    expect(texto).toContain("Florindos Bar");
    expect(texto).toContain("Uberlândia");
    expect(texto).not.toMatch(/(^|[^a-z])tatu([^a-z]|$)/i);
  });

  it("cita os serviços de terceiros que o sistema realmente usa", () => {
    for (const nome of ["Meta", "WhatsApp", "Supabase", "Vercel", "Cloudflare", "Google Fonts", "Spotify"]) {
      expect(texto).toContain(nome);
    }
  });

  it("descreve o atendimento sem IA generativa e o repasse para uma pessoa", () => {
    expect(texto).toMatch(/sem inteligência artificial generativa/);
    expect(texto).toMatch(/atendente/);
  });

  it("informa os prazos de guarda e os direitos da LGPD", () => {
    for (const trecho of ["90 dias", "12 meses", "24 meses", "30 dias", "LGPD", "ANPD", "eliminação", "portabilidade", "revogação"]) {
      expect(texto).toContain(trecho);
    }
  });

  it("não deixa marcadores de pendência no texto público e omite campos não preenchidos", () => {
    expect(texto).not.toMatch(/\[[A-ZÀ-Ú ]{4,}\]|PREENCHER|TODO|undefined|null/);
    if (!site.privacidade.cnpj) expect(texto).not.toMatch(/CNPJ/);
    if (!site.privacidade.emailContato) expect(html).not.toContain("mailto:");
  });

  it("o contato sempre existe (Instagram da label) mesmo sem e-mail configurado", () => {
    expect(html).toContain(`instagram.com/${site.instagram}`);
  });

  it("mostra a data de atualização e tem título próprio", () => {
    expect(texto).toContain(`Última atualização: ${site.privacidade.atualizadaEm}`);
    expect(metadata.title).toBe("Política de Privacidade");
  });
});

describe("acesso à política", () => {
  it("está no sitemap", () => {
    expect(sitemap().map((i) => i.url)).toContain(`${site.url}/privacidade`);
  });

  it("está linkada no rodapé e no aviso do formulário de reserva", () => {
    const raiz = new URL("../src/components/", import.meta.url);
    expect(readFileSync(new URL("Footer.tsx", raiz), "utf8")).toContain('href="/privacidade"');
    expect(readFileSync(new URL("ReservaMesa.tsx", raiz), "utf8")).toContain('href="/privacidade"');
  });
});
