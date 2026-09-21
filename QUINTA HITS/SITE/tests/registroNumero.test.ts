import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { ID_OUTRO_NUMERO, ID_QUINTA_HITS } from "./helpers/whatsapp";

const SCRIPT = fileURLToPath(new URL("../scripts/registrar-numero.mjs", import.meta.url));
type Modulo = typeof import("../scripts/registrar-numero.mjs");
const carregar = async () => (await import(/* @vite-ignore */ SCRIPT)) as Modulo;

/** Ambiente que satisfaria TODAS as travas (valores fictícios). */
const envCompleto = () => ({ WHATSAPP_REGISTRATION_ENABLED: "true", WHATSAPP_PHONE_NUMBER_ID: ID_QUINTA_HITS, WHATSAPP_TOKEN: "token-ficticio-do-teste" });
const ARG = "--confirmo-registrar-quinta-hits";

describe("registro do número: só com todas as travas, e nunca de verdade nos testes", () => {
  it("por padrão (nada configurado) RECUSA e não chama a rede", async () => {
    const { registrar } = await carregar();
    const fetchImpl = vi.fn();
    const perguntar = vi.fn();
    const r = await registrar({ env: {}, argv: [], interativo: true, perguntar, perguntarOculto: perguntar, fetchImpl, log: () => undefined });
    expect(r).toMatchObject({ ok: false, recusado: true });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(perguntar).not.toHaveBeenCalled(); // nem chega a perguntar o PIN
  });

  it("cada trava sozinha barra o registro (nenhuma pergunta, nenhuma rede)", async () => {
    const { registrar } = await carregar();
    const casos: [string, { env: Record<string, string>; argv: string[]; interativo: boolean }][] = [
      ["flag desligada", { env: { ...envCompleto(), WHATSAPP_REGISTRATION_ENABLED: "false" }, argv: [ARG], interativo: true }],
      ["flag com valor diferente de 'true'", { env: { ...envCompleto(), WHATSAPP_REGISTRATION_ENABLED: "TRUE" }, argv: [ARG], interativo: true }],
      ["sem o argumento de confirmação", { env: envCompleto(), argv: [], interativo: true }],
      ["sem terminal interativo", { env: envCompleto(), argv: [ARG], interativo: false }],
      ["Phone Number ID de OUTRO número (ex.: o final 0200)", { env: { ...envCompleto(), WHATSAPP_PHONE_NUMBER_ID: ID_OUTRO_NUMERO }, argv: [ARG], interativo: true }],
      ["sem Phone Number ID", { env: { ...envCompleto(), WHATSAPP_PHONE_NUMBER_ID: "" }, argv: [ARG], interativo: true }],
      ["sem token", { env: { ...envCompleto(), WHATSAPP_TOKEN: "" }, argv: [ARG], interativo: true }],
    ];
    for (const [nome, entrada] of casos) {
      const fetchImpl = vi.fn();
      const perguntar = vi.fn();
      const r = await registrar({ ...entrada, perguntar, perguntarOculto: perguntar, fetchImpl, log: () => undefined });
      expect(r.recusado, nome).toBe(true);
      expect(fetchImpl, nome).not.toHaveBeenCalled();
      expect(perguntar, nome).not.toHaveBeenCalled();
    }
  });

  it("frase de confirmação errada ou PIN inválido: recusa sem chamar a rede", async () => {
    const { registrar, FRASE_DE_CONFIRMACAO } = await carregar();
    const fetchImpl = vi.fn();
    const base = { env: envCompleto(), argv: [ARG], interativo: true, fetchImpl, log: () => undefined };
    expect((await registrar({ ...base, perguntar: async () => "registrar", perguntarOculto: async () => "123456" })).recusado).toBe(true);
    for (const pin of ["", "12345", "1234567", "abcdef", "12 456"]) {
      expect((await registrar({ ...base, perguntar: async () => FRASE_DE_CONFIRMACAO, perguntarOculto: async () => pin })).recusado, pin).toBe(true);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("com TUDO satisfeito e rede FALSA: chama uma única vez o /register do ID da QUINTA HITS e nunca imprime token nem PIN", async () => {
    const { registrar, FRASE_DE_CONFIRMACAO } = await carregar();
    const chamadas: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: never) => { chamadas.push({ url, init }); return { ok: true, status: 200 } as Response; });
    const saidas: string[] = [];
    const r = await registrar({ env: envCompleto(), argv: [ARG], interativo: true, perguntar: async () => FRASE_DE_CONFIRMACAO, perguntarOculto: async () => "654321", fetchImpl: fetchImpl as unknown as typeof fetch, log: (t: string) => saidas.push(t) });
    expect(r).toEqual({ ok: true, recusado: false, status: 200 });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toBe(`https://graph.facebook.com/v21.0/${ID_QUINTA_HITS}/register`);
    expect(chamadas[0].init.method).toBe("POST");
    expect(JSON.parse(chamadas[0].init.body)).toEqual({ messaging_product: "whatsapp", pin: "654321" });
    const impresso = saidas.join("\n");
    expect(impresso).not.toContain("654321");
    expect(impresso).not.toContain("token-ficticio-do-teste");
    // o mesmo global bloqueado dos testes prova que nenhuma rede real foi tocada
    expect(fetch).not.toHaveBeenCalled();
  });

  it("como comando (sem flag, sem terminal): sai com erro e diz por que, sem tocar na rede", () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8", env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } as unknown as NodeJS.ProcessEnv, timeout: 15_000 });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("RECUSADO");
    expect(r.stdout).toContain("WHATSAPP_REGISTRATION_ENABLED");
    expect(r.stdout + r.stderr).not.toContain("Bearer");
  });
});
