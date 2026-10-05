import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ID_QUINTA_HITS } from "./helpers/whatsapp";

vi.mock("@/lib/regras", () => ({
  situacaoDoSite: vi.fn(async () => ({ prontas: [{ edicao: { id: "2026-10-08" }, regras: {}, mesasSite: 6 }], proximaAbertura: null })),
}));
vi.mock("@/components/ReservaMesa", () => ({ default: () => createElement("div", null, "FORMULARIO_DE_RESERVA") }));

import Reservar from "@/app/reservar/page";
import { situacaoDoSite } from "@/lib/regras";

const renderizar = async () => renderToStaticMarkup(await Reservar());

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
  afterEach(() => { vi.unstubAllEnvs(); vi.mocked(situacaoDoSite).mockClear(); });

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

  it("RESERVAS_SITE_ENABLED ligada mas sem como confirmar pelo WhatsApp (sem credenciais): continua fechado", async () => {
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    const html = await renderizar();
    expect(html).not.toContain("FORMULARIO_DE_RESERVA");
    expect(html).toContain("abrem em breve");
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
    expect(html).toContain("As reservas da quinta 08/10 abrem segunda, 05/10, às 12h.");
    expect(html).not.toContain("FORMULARIO_DE_RESERVA");
  });
});
