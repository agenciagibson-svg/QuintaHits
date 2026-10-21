import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ID_QUINTA_HITS } from "./helpers/whatsapp";

// Por padrão: uma noite pronta na Quinta Hits e nenhuma nas outras casas.
vi.mock("@/lib/regras", () => ({
  situacaoDoSite: vi.fn(async (_agora?: Date, _limite?: number, casa = "quinta-hits") =>
    casa === "quinta-hits"
      ? { prontas: [{ edicao: { id: "2026-10-08", data: "2026-10-08", artista: "Atração QH", local: "Florindos Bar" }, regras: {}, mesasSite: 6 }], proximaAbertura: null }
      : { prontas: [], proximaAbertura: null }),
}));
vi.mock("@/components/ReservaMesa", () => ({ default: () => createElement("div", null, "FORMULARIO_DE_RESERVA") }));

import Reservar from "@/app/reservar/page";
import { situacaoDoSite } from "@/lib/regras";

const renderizar = async () => renderToStaticMarkup(await Reservar({ searchParams: Promise.resolve({}) }));

/** Credenciais completas (fictícias) e as chaves de envio ligadas; a chave do SITE fica por conta de cada teste. */
function integracaoCompleta() {
  vi.stubEnv("APP_AMBIENTE", "producao");
  vi.stubEnv("WHATSAPP_NUMERO_CASA", "5534991167064");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_QUINTA_HITS);
  vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio");
  vi.stubEnv("WHATSAPP_APP_SECRET", "segredo-ficticio");
  vi.stubEnv("WHATSAPP_SEND_ENABLED", "true");
  vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true");
}

describe("/reservar: formulário escondido enquanto a reserva do site não estiver aberta", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(situacaoDoSite).mockClear();
    vi.mocked(situacaoDoSite).mockImplementation(async (_a, _l, casa = "quinta-hits") =>
      casa === "quinta-hits"
        ? { prontas: [{ edicao: { id: "2026-10-08", data: "2026-10-08", artista: "Atração QH", local: "Florindos Bar" } as never, regras: {} as never, mesasSite: 6 }], proximaAbertura: null }
        : { prontas: [], proximaAbertura: null },
    );
  });

  it("sem nenhuma variável (produção hoje): aviso amigável e Instagram, sem formulário e sem consultar o banco", async () => {
    const html = await renderizar();
    expect(html).not.toContain("FORMULARIO_DE_RESERVA");
    expect(html).toContain("abrem em breve");
    expect(html).toContain("instagram.com/quintahits");
    expect(situacaoDoSite).not.toHaveBeenCalled();
  });

  it("credenciais completas e chaves de envio ligadas, mas RESERVAS_SITE_ENABLED desligada: continua fechado", async () => {
    integracaoCompleta();
    const html = await renderizar();
    expect(html).not.toContain("FORMULARIO_DE_RESERVA");
    expect(html).toContain("abrem em breve");
    expect(situacaoDoSite).not.toHaveBeenCalled();
  });

  it("RESERVAS_SITE_ENABLED ligada mas sem WhatsApp: a Quinta Hits fica fechada (as outras casas, sem noite pronta, nada mostram)", async () => {
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    const html = await renderizar();
    expect(html).not.toContain("FORMULARIO_DE_RESERVA");
    expect(vi.mocked(situacaoDoSite).mock.calls.map((c) => c[2])).toEqual(["harley-grill"]);
    expect(html).toContain("Ainda não abrimos reservas");
  });

  it("noites abertas em mais de uma casa: todas aparecem em ordem de data, com o nome da casa", async () => {
    integracaoCompleta();
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    vi.mocked(situacaoDoSite).mockImplementation(async (_a, _l, casa) =>
      casa === "harley-grill"
        ? { prontas: [{ edicao: { id: "2026-10-06_harley-grill", data: "2026-10-06", artista: "Voo Livre", local: "Harley Grill" } as never, regras: {} as never, mesasSite: 93 }], proximaAbertura: null }
        : { prontas: [{ edicao: { id: "2026-10-08", data: "2026-10-08", artista: "Atração QH", local: "Florindos Bar" } as never, regras: {} as never, mesasSite: 6 }], proximaAbertura: null },
    );
    const html = await renderizar();
    expect(html).toContain("FORMULARIO_DE_RESERVA");
    expect(html.indexOf("Voo Livre")).toBeGreaterThan(-1);
    expect(html.indexOf("Voo Livre")).toBeLessThan(html.indexOf("Atração QH")); // 06/10 antes de 08/10
    expect(html).toContain("Harley Grill");
    expect(html).toContain("Florindos Bar");
  });

  it("só o Harley com noite aberta (Quinta Hits sem noite pronta): a página mostra a noite do Harley", async () => {
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    vi.mocked(situacaoDoSite).mockImplementation(async (_a, _l, casa) =>
      casa === "harley-grill"
        ? { prontas: [{ edicao: { id: "2026-10-06_harley-grill", data: "2026-10-06", artista: "Voo Livre", local: "Harley Grill" } as never, regras: {} as never, mesasSite: 93 }], proximaAbertura: null }
        : { prontas: [], proximaAbertura: null },
    );
    expect(await renderizar()).toContain("FORMULARIO_DE_RESERVA");
  });

  it("chave ligada e integração completa: mostra o formulário", async () => {
    integracaoCompleta();
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    expect(await renderizar()).toContain("FORMULARIO_DE_RESERVA");
  });

  it("chave ligada, integração completa, mas nenhuma edição pronta e liberada: mensagem de reservas ainda não abertas", async () => {
    integracaoCompleta();
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    vi.mocked(situacaoDoSite).mockResolvedValueOnce({ prontas: [], proximaAbertura: null });
    const html = await renderizar();
    expect(html).toContain("Ainda não abrimos reservas");
    expect(html).not.toContain("FORMULARIO_DE_RESERVA");
  });

  it("edição pronta, mas antes da abertura semanal: diz o dia e a hora em que as reservas abrem", async () => {
    integracaoCompleta();
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    vi.mocked(situacaoDoSite).mockResolvedValueOnce({
      prontas: [],
      proximaAbertura: { edicao: { id: "2026-10-08", data: "2026-10-08" } as never, abreEm: "2026-10-05T15:00:00.000Z", descricao: "segunda, 05/10, às 12h" },
    });
    const html = await renderizar();
    expect(html).toContain("As reservas do dia 08/10 abrem segunda, 05/10, às 12h.");
    expect(html).not.toContain("FORMULARIO_DE_RESERVA");
  });
});
