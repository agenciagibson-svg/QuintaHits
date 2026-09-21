import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ID_QUINTA_HITS } from "./helpers/whatsapp";

vi.mock("@/lib/reservas", () => ({ edicoesReservaveis: vi.fn(async () => [{ id: "2026-10-08" }]) }));
vi.mock("@/components/ReservaMesa", () => ({ default: () => createElement("div", null, "FORMULARIO_DE_RESERVA") }));

import Reservar from "@/app/reservar/page";
import { edicoesReservaveis } from "@/lib/reservas";

const renderizar = async () => renderToStaticMarkup(await Reservar());

describe("/reservar antes e depois de a integração do WhatsApp estar configurada", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.mocked(edicoesReservaveis).mockClear(); });

  it("sem as variáveis do WhatsApp (produção hoje): mostra aviso amigável e o Instagram, sem formulário", async () => {
    const html = await renderizar();
    expect(html).not.toContain("FORMULARIO_DE_RESERVA");
    expect(html).toContain("abrem em breve");
    expect(html).toContain("instagram.com/quintahits");
    expect(edicoesReservaveis).not.toHaveBeenCalled();
  });

  it("com a integração completa e o envio ligado: mostra o formulário", async () => {
    vi.stubEnv("APP_AMBIENTE", "producao");
    vi.stubEnv("WHATSAPP_NUMERO_CASA", "5534999998888");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_QUINTA_HITS);
    vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio");
    vi.stubEnv("WHATSAPP_APP_SECRET", "segredo-ficticio");
    vi.stubEnv("WHATSAPP_SEND_ENABLED", "true");
    expect(await renderizar()).toContain("FORMULARIO_DE_RESERVA");
  });

  it("integração completa, mas sem edições abertas: mensagem de reservas ainda não abertas", async () => {
    vi.stubEnv("APP_AMBIENTE", "producao");
    vi.stubEnv("WHATSAPP_NUMERO_CASA", "5534999998888");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_QUINTA_HITS);
    vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio");
    vi.stubEnv("WHATSAPP_APP_SECRET", "segredo-ficticio");
    vi.stubEnv("WHATSAPP_SEND_ENABLED", "true");
    vi.mocked(edicoesReservaveis).mockResolvedValueOnce([]);
    const html = await renderizar();
    expect(html).toContain("Ainda não abrimos reservas");
    expect(html).not.toContain("FORMULARIO_DE_RESERVA");
  });
});
