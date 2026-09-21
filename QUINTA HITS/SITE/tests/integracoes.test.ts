import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { ID_QUINTA_HITS } from "./helpers/whatsapp";

const sessao = vi.hoisted(() => ({ autenticado: true }));

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});
vi.mock("@/lib/adminSessao", () => ({
  exigirSessao: async () => (sessao.autenticado ? null : NextResponse.json({ erro: "Não autenticado." }, { status: 401 })),
  atorDaSessao: async () => "equipe@teste.com",
}));

import { GET as lerIntegracoes } from "@/app/api/admin/integracoes/route";
import { GET as lerAuditoria } from "@/app/api/admin/auditoria/route";
import { registrarAuditoria } from "@/lib/auditoria";

let banco: BancoTeste;
let bancoAntigo: BancoTeste;
beforeAll(async () => { banco = await criarBancoTeste(); bancoAntigo = await criarBancoTeste({ migracao: false }); });
afterAll(async () => { definirBanco(null); await banco.pg.close(); await bancoAntigo.pg.close(); });
beforeEach(async () => { definirBanco(banco); sessao.autenticado = true; await banco.limpar(); });

// Valores INVENTADOS e reconhecíveis: se algum aparecer na resposta, o painel estaria vazando segredo.
const SEGREDOS = {
  WHATSAPP_TOKEN: "EAAG-token-inventado-9f3a1c",
  WHATSAPP_APP_SECRET: "app-secret-inventado-77b2d0",
  WHATSAPP_VERIFY_TOKEN: "verify-inventado-51e8aa",
  TURNSTILE_SECRET_KEY: "0x4AAA-turnstile-inventado-c4d2",
  SUPABASE_SERVICE_ROLE_KEY: "eyJ-service-role-inventada-1234567890",
  ADMIN_SESSION_SECRET: "sessao-inventada-com-mais-de-trinta-e-dois-caracteres",
  CRON_SECRET: "cron-inventado-aa77",
};

describe("GET /api/admin/integracoes", () => {
  it("exige sessão", async () => {
    sessao.autenticado = false;
    expect((await lerIntegracoes()).status).toBe(401);
  });

  it("padrão: todas as chaves de segurança desligadas, sem credenciais, envio bloqueado e site fechado", async () => {
    const j = await (await lerIntegracoes()).json();
    const chave = (nome: string) => j.chaves.find((c: { nome: string }) => c.nome === nome).ligada;
    for (const nome of ["WHATSAPP_AGENT_ENABLED", "WHATSAPP_SEND_ENABLED", "WHATSAPP_REGISTRATION_ENABLED", "RESERVAS_SITE_ENABLED", "RETENCAO_ENABLED"]) expect(chave(nome), nome).toBe(false);
    expect(chave("WHATSAPP_HUMAN_HANDOFF_ENABLED")).toBe(true); // padrão ligado (só repassa para pessoa)
    expect(j.envio_real_liberado_agora).toBe(false);
    expect(j.reservas_site).toEqual({ aberto: false, motivo: "chave_desligada" });
    expect(j.credenciais.every((c: { configurada: boolean }) => !c.configurada)).toBe(true);
    expect(j.banco).toMatchObject({ migrado: true, parte2: true, ambiente: "producao", agente_ativo: false, envio_ativo: false, pausa_emergencia: false, restringir_a_numeros_teste: true, quantidade_de_numeros_teste: 0, limpeza_ativa: false, politica_retencao_validada: false });
  });

  it("NUNCA devolve o valor de nenhuma credencial: só 'configurada' true/false", async () => {
    for (const [nome, valor] of Object.entries(SEGREDOS)) vi.stubEnv(nome, valor);
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_QUINTA_HITS);
    vi.stubEnv("WHATSAPP_NUMERO_CASA", "5534991167064");
    vi.stubEnv("SUPABASE_URL", "https://projeto-inventado.supabase.co");
    const resposta = await lerIntegracoes();
    const texto = await resposta.text();
    for (const valor of [...Object.values(SEGREDOS), "projeto-inventado", "5534991167064", ID_QUINTA_HITS]) expect(texto, valor).not.toContain(valor);
    const j = JSON.parse(texto);
    const cred = (nome: string) => j.credenciais.find((c: { nome: string }) => c.nome === nome).configurada;
    for (const nome of ["WHATSAPP_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN", "TURNSTILE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET", "SUPABASE_URL", "WHATSAPP_NUMERO_CASA"]) expect(cred(nome), nome).toBe(true);
    expect(j.numero.id_de_envio_confere).toBe(true);
  });

  it("credenciais completas NÃO ligam nenhuma chave nem liberam envio ou site", async () => {
    for (const [nome, valor] of Object.entries(SEGREDOS)) vi.stubEnv(nome, valor);
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_QUINTA_HITS);
    vi.stubEnv("WHATSAPP_NUMERO_CASA", "5534991167064");
    const j = await (await lerIntegracoes()).json();
    expect(j.chaves.filter((c: { ligada: boolean; nome: string }) => c.ligada && c.nome !== "WHATSAPP_HUMAN_HANDOFF_ENABLED")).toEqual([]);
    expect(j.envio_real_liberado_agora).toBe(false);
    expect(j.reservas_site.aberto).toBe(false);
  });

  it("chaves ligadas por variável aparecem como ligadas, mas o envio real segue bloqueado pelo banco (agente e envio desligados lá)", async () => {
    vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true");
    vi.stubEnv("WHATSAPP_SEND_ENABLED", "true");
    const j = await (await lerIntegracoes()).json();
    expect(j.chaves.filter((c: { ligada: boolean }) => c.ligada).map((c: { nome: string }) => c.nome)).toEqual(expect.arrayContaining(["WHATSAPP_AGENT_ENABLED", "WHATSAPP_SEND_ENABLED"]));
    expect(j.envio_real_liberado_agora).toBe(false);
  });

  it("banco sem a migração: informa 'não aplicada' sem quebrar", async () => {
    definirBanco(bancoAntigo);
    const j = await (await lerIntegracoes()).json();
    expect(j.banco).toMatchObject({ migrado: false, parte2: false, ambiente: null });
  });
});

describe("GET /api/admin/auditoria", () => {
  it("exige sessão", async () => {
    sessao.autenticado = false;
    expect((await lerAuditoria(new Request("http://x"))).status).toBe(401);
  });

  it("lista as ações mais recentes primeiro, respeita o limite e limita o máximo", async () => {
    for (let i = 1; i <= 5; i++) await registrarAuditoria({ ator: "equipe@teste.com", acao: `acao_${i}`, entidade: "teste" });
    const j = await (await lerAuditoria(new Request("http://x/api/admin/auditoria?limite=3"))).json();
    expect(j.itens.map((i: { acao: string }) => i.acao)).toEqual(["acao_5", "acao_4", "acao_3"]);
    expect((await (await lerAuditoria(new Request("http://x/api/admin/auditoria?limite=abc"))).json()).itens).toHaveLength(5);
  });

  it("sem a migração: { migrado: false }", async () => {
    definirBanco(bancoAntigo);
    expect(await (await lerAuditoria(new Request("http://x"))).json()).toEqual({ migrado: false, itens: [] });
  });
});
