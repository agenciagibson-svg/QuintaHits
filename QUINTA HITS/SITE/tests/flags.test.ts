import { describe, expect, it, vi } from "vitest";
import {
  agenteLigadoPorEnv,
  envioLigadoPorEnv,
  envioRealPermitidoPorEnv,
  registroLigadoPorEnv,
  reservasSiteLigadoPorEnv,
} from "@/lib/agente/ambiente";
import { whatsappConfigurado, enviarTexto } from "@/lib/whatsapp";
import { ID_QUINTA_HITS } from "./helpers/whatsapp";

const FLAGS = ["WHATSAPP_AGENT_ENABLED", "WHATSAPP_SEND_ENABLED", "WHATSAPP_REGISTRATION_ENABLED", "RESERVAS_SITE_ENABLED"] as const;
const leituras = () => [agenteLigadoPorEnv(), envioLigadoPorEnv(), registroLigadoPorEnv(), reservasSiteLigadoPorEnv()];

/** Todas as credenciais da Meta preenchidas (valores fictícios), sem ligar nenhuma flag. */
function credenciaisCompletas() {
  vi.stubEnv("APP_AMBIENTE", "producao");
  vi.stubEnv("WHATSAPP_NUMERO_CASA", "5534991167064");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_QUINTA_HITS);
  vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio");
  vi.stubEnv("WHATSAPP_APP_SECRET", "segredo-ficticio");
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "verificacao-ficticia");
  vi.stubEnv("WHATSAPP_WABA_ID", "2225871044650782");
  vi.stubEnv("META_APP_ID", "1618887669882753");
}

describe("as quatro flags independentes", () => {
  it("todas nascem DESLIGADAS quando não há nenhuma variável", () => {
    expect(leituras()).toEqual([false, false, false, false]);
    expect(envioRealPermitidoPorEnv()).toBe(false);
  });

  it("valor vazio, inválido ou diferente do texto exato 'true' mantém desligada", () => {
    for (const nome of FLAGS) {
      for (const v of ["", " ", "false", "0", "1", "yes", "sim", "on", "TRUE", "True", " true", "true ", "verdadeiro", "truee"]) {
        vi.stubEnv(nome, v);
        expect(leituras().some(Boolean), `${nome}=${JSON.stringify(v)}`).toBe(false);
      }
      vi.stubEnv(nome, "");
    }
  });

  it("cada flag liga só a si mesma", () => {
    FLAGS.forEach((nome, i) => {
      vi.stubEnv(nome, "true");
      const esperado = [false, false, false, false];
      esperado[i] = true;
      expect(leituras(), nome).toEqual(esperado);
      vi.stubEnv(nome, "");
    });
  });

  it("credenciais completas da Meta NÃO ligam nenhuma funcionalidade", () => {
    credenciaisCompletas();
    expect(leituras()).toEqual([false, false, false, false]);
    expect(envioRealPermitidoPorEnv()).toBe(false);
    expect(whatsappConfigurado()).toBe(false);
  });

  it("envio real exige AGENTE e ENVIO ao mesmo tempo", () => {
    vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true");
    expect(envioRealPermitidoPorEnv()).toBe(false);
    vi.stubEnv("WHATSAPP_AGENT_ENABLED", "");
    vi.stubEnv("WHATSAPP_SEND_ENABLED", "true");
    expect(envioRealPermitidoPorEnv()).toBe(false);
    vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true");
    expect(envioRealPermitidoPorEnv()).toBe(true);
  });

  it("com credenciais e SÓ uma das duas chaves de envio, nenhuma mensagem sai (fetch nem é chamado)", async () => {
    credenciaisCompletas();
    for (const [agente, envio] of [["true", ""], ["", "true"], ["true", "false"], ["false", "true"]]) {
      vi.stubEnv("WHATSAPP_AGENT_ENABLED", agente);
      vi.stubEnv("WHATSAPP_SEND_ENABLED", envio);
      await enviarTexto("5534999998888", "teste");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a reserva do site depende de RESERVAS_SITE_ENABLED, não das credenciais nem das chaves do WhatsApp", () => {
    credenciaisCompletas();
    vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true");
    vi.stubEnv("WHATSAPP_SEND_ENABLED", "true");
    expect(reservasSiteLigadoPorEnv()).toBe(false);
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    expect(reservasSiteLigadoPorEnv()).toBe(true);
  });
});
