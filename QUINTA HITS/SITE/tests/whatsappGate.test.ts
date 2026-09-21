import { afterEach, describe, expect, it, vi } from "vitest";
import { whatsappConfigurado } from "@/lib/whatsapp";
import { ID_OUTRO_NUMERO, ID_QUINTA_HITS } from "./helpers/whatsapp";

/** Ambiente de produção completo: o site só pode aceitar reservas se a confirmação também puder ser ENVIADA. */
function ambienteCompleto() {
  vi.stubEnv("APP_AMBIENTE", "producao");
  vi.stubEnv("WHATSAPP_NUMERO_CASA", "5534999998888");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_QUINTA_HITS);
  vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio");
  vi.stubEnv("WHATSAPP_APP_SECRET", "segredo-ficticio");
  vi.stubEnv("WHATSAPP_SEND_ENABLED", "true"); vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true");
}

describe("whatsappConfigurado (libera as reservas do site)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("com tudo configurado e o envio ligado, libera", () => {
    ambienteCompleto();
    expect(whatsappConfigurado()).toBe(true);
  });

  it("sem WHATSAPP_SEND_ENABLED=true NÃO libera (senão o cliente reservaria e nunca receberia a confirmação)", () => {
    ambienteCompleto();
    vi.stubEnv("WHATSAPP_SEND_ENABLED", "");
    expect(whatsappConfigurado()).toBe(false);
    vi.stubEnv("WHATSAPP_SEND_ENABLED", "false");
    expect(whatsappConfigurado()).toBe(false);
  });

  it("com o Phone Number ID de outro número (ex.: o final 0200), NÃO libera", () => {
    ambienteCompleto();
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_OUTRO_NUMERO);
    expect(whatsappConfigurado()).toBe(false);
  });

  it("faltando qualquer uma das variáveis obrigatórias, NÃO libera", () => {
    for (const nome of ["WHATSAPP_NUMERO_CASA", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TOKEN", "WHATSAPP_APP_SECRET"]) {
      ambienteCompleto();
      vi.stubEnv(nome, "");
      expect(whatsappConfigurado(), nome).toBe(false);
    }
  });

  it("sem nenhuma variável (situação atual de produção), NÃO libera", () => {
    expect(whatsappConfigurado()).toBe(false);
  });
});

describe("log de falha de envio (sem telefone nem corpo da resposta)", () => {
  it("registra só o status e o código do erro", async () => {
    vi.stubEnv("APP_AMBIENTE", "producao");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_QUINTA_HITS);
    vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio");
    vi.stubEnv("WHATSAPP_SEND_ENABLED", "true");
    vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 131047, message: "Re-engagement message to 5534999998888 failed" } }), { status: 400 })));
    const erros = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { enviarTexto } = await import("@/lib/whatsapp");
    await enviarTexto("5534999998888", "oi");
    const impresso = JSON.stringify(erros.mock.calls);
    expect(impresso).toContain("131047");
    expect(impresso).not.toContain("5534999998888");
    expect(impresso).not.toContain("Re-engagement");
    expect(impresso).not.toContain("token-ficticio");
  });
});
