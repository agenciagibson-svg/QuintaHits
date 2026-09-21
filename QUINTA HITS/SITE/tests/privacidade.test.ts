import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Privacidade, { metadata } from "@/app/privacidade/page";
import sitemap from "@/app/sitemap";
import { site } from "@/config/site";
import { cnpjValido } from "@/lib/cnpj";

const html = renderToStaticMarkup(Privacidade());
const texto = html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

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

  it("não promete o que o sistema ainda não faz: assistente e limpeza automática aparecem como pendentes", () => {
    expect(texto).toMatch(/poderão ser atendidas por um assistente automático/);
    expect(texto).toMatch(/Enquanto ele não estiver ativo/);
    expect(texto).toMatch(/rotina automática de limpeza ainda está em implantação/);
    expect(texto).toMatch(/pedir a exclusão dos seus dados a qualquer momento/);
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

describe("dados oficiais na política", () => {
  it("identifica a razão social, o endereço e o contato de privacidade", () => {
    expect(texto).toContain("K. L & F PRODUÇÕES E PROMOÇÕES ARTÍSTICAS LTDA");
    expect(texto).toContain("Av. dos Vinhedos, 70, Sala 109 – Uberlândia/MG – CEP 38411-217");
    expect(html).toContain('href="mailto:agenciagibson@gmail.com"');
    expect(texto).toContain("agenciagibson@gmail.com");
    expect(texto).toContain("GIBSON PROMOÇÕES");
    expect(texto).not.toMatch(/Gibson Produções/i);
  });

  it("não inventa encarregado de dados e diz que o contato atende os pedidos", () => {
    expect(texto).toContain("Não há encarregado de dados designado");
    expect(texto).not.toMatch(/nosso encarregado|DPO:/i);
  });

  it("explica retenção, direitos e o pedido de acesso, correção e exclusão", () => {
    for (const trecho of ["acesso", "correção", "exclusão", "90 dias", "12 meses", "24 meses", "30 dias", "Supabase", "Meta"]) expect(texto).toContain(trecho);
  });

  it("o CNPJ configurado é VÁLIDO ou está vazio; nunca um número malformado", () => {
    const configurado = site.privacidade.cnpj;
    if (configurado) expect(cnpjValido(configurado)).toBe(true);
    else expect(texto).not.toMatch(/CNPJ \d/);
  });
});

describe("cnpjValido", () => {
  it("recusa o número informado com 13 dígitos e aceita só o que fecha nos dígitos verificadores", () => {
    expect(cnpjValido("58.820.970/0013-7")).toBe(false); // 13 dígitos
    expect(cnpjValido("58.820.970/0001-37")).toBe(false);
    expect(cnpjValido("58.820.970/0013-57")).toBe(true); // único ajuste de um dígito que valida; aguardando confirmação do responsável
    expect(cnpjValido("11.111.111/1111-11")).toBe(false);
    expect(cnpjValido("")).toBe(false);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true); // CNPJ de exemplo válido
  });
});
