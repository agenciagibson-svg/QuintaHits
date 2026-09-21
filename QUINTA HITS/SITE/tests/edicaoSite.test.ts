import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { criarEdicao, criarMesa, liberarEdicaoParaSite } from "./helpers/cenarios";
import { ID_QUINTA_HITS } from "./helpers/whatsapp";
import { avaliarProntidaoDoSite, REGRAS_VAZIAS, validarRegras, type RegrasEdicao } from "@/lib/regrasEdicao";
import type { Edicao } from "@/lib/edicao";

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});

import { POST } from "@/app/api/reservas/route";
import { GET as mapa } from "@/app/api/reservas/mapa/route";
import { _reiniciarCacheDeCanais } from "@/lib/disponibilidade";
import { carregarPainelDeRegras, edicaoProntaParaSite, edicoesProntasParaSite, salvarRegrasECanais } from "@/lib/regras";
import { _reiniciarLimites } from "@/lib/limiteTaxa";

let banco: BancoTeste;
let bancoParte1: BancoTeste;
beforeAll(async () => { banco = await criarBancoTeste(); bancoParte1 = await criarBancoTeste({ parte2: false }); });
afterAll(async () => { definirBanco(null); await banco.pg.close(); await bancoParte1.pg.close(); });

const AGORA = new Date("2026-09-21T15:00:00Z");
const edicao = (o: Partial<Edicao> = {}): Edicao => ({ id: "2026-10-08", data: "2026-10-08", artista: "X", instagram: "", tema: "", genero: "", horario: "20h", local: "Florindos Bar", status: "confirmada", destaque: "", ...o });
const completas = (o: Partial<RegrasEdicao> = {}): RegrasEdicao => ({
  ...REGRAS_VAZIAS, abertura: "19h", reservas_ate: "2026-10-08T18:00:00.000Z", tolerancia_min: 15, cancelamento_ate_horas: 24,
  capacidade_maxima: 120, consumacao_minima_centavos: 0, instrucoes_chegada: "Chegue cedo.", reservas_site: true, ...o,
});

describe("avaliarProntidaoDoSite (pura)", () => {
  it("completa, liberada e com mesa oferecida ao site: pronta", () => {
    expect(avaliarProntidaoDoSite({ edicao: edicao(), regras: completas(), mesasSite: 3, agora: AGORA })).toEqual({ pronta: true, faltando: [] });
  });

  it("sem regras nenhuma: lista EXATAMENTE o que falta, sem supor valor algum", () => {
    const r = avaliarProntidaoDoSite({ edicao: edicao(), regras: null, mesasSite: 0, agora: AGORA });
    expect(r.pronta).toBe(false);
    expect(r.faltando).toEqual([
      "horário de abertura", "prazo final para reservar", "tolerância", "prazo de cancelamento", "capacidade máxima",
      "consumação mínima (use 0 se não houver)", "instruções de chegada", "ao menos uma mesa oferecida ao site", "liberação da edição para reservas pelo site",
    ]);
  });

  it("cada campo obrigatório sozinho barra a edição e aparece pelo nome", () => {
    const casos: [Partial<RegrasEdicao>, string][] = [
      [{ abertura: null }, "horário de abertura"], [{ reservas_ate: null }, "prazo final para reservar"],
      [{ tolerancia_min: null }, "tolerância"], [{ cancelamento_ate_horas: null }, "prazo de cancelamento"],
      [{ capacidade_maxima: null }, "capacidade máxima"], [{ consumacao_minima_centavos: null }, "consumação mínima (use 0 se não houver)"],
      [{ instrucoes_chegada: null }, "instruções de chegada"], [{ reservas_site: false }, "liberação da edição para reservas pelo site"],
      [{ reservas_ate: "2026-09-01T00:00:00.000Z" }, "prazo final para reservar (já passou)"],
    ];
    for (const [mudanca, texto] of casos) {
      const r = avaliarProntidaoDoSite({ edicao: edicao(), regras: completas(mudanca), mesasSite: 2, agora: AGORA });
      expect(r.pronta, texto).toBe(false);
      expect(r.faltando, texto).toEqual([texto]);
    }
  });

  it("horário do evento, edição passada ou cancelada e nenhuma mesa para o site também barram", () => {
    expect(avaliarProntidaoDoSite({ edicao: edicao({ horario: "" }), regras: completas(), mesasSite: 2, agora: AGORA }).faltando).toEqual(["horário do evento"]);
    expect(avaliarProntidaoDoSite({ edicao: edicao({ data: "2026-01-01" }), regras: completas(), mesasSite: 2, agora: AGORA }).faltando).toContain("edição que já passou");
    expect(avaliarProntidaoDoSite({ edicao: edicao({ status: "cancelada" }), regras: completas(), mesasSite: 2, agora: AGORA }).faltando).toContain("edição cancelada ou já realizada");
    expect(avaliarProntidaoDoSite({ edicao: edicao(), regras: completas(), mesasSite: 0, agora: AGORA }).faltando).toEqual(["ao menos uma mesa oferecida ao site"]);
    expect(avaliarProntidaoDoSite({ edicao: null, regras: null, mesasSite: 0 }).faltando).toEqual(["edição não encontrada"]);
  });

  it("liberar só para o agente NÃO libera o site (e vice-versa)", () => {
    const soAgente = completas({ atendimento_automatico: true, reservas_site: false });
    expect(avaliarProntidaoDoSite({ edicao: edicao(), regras: soAgente, mesasSite: 1, agora: AGORA }).pronta).toBe(false);
  });
});

describe("validarRegras: reservas_site", () => {
  it("aceita booleano e recusa qualquer outra coisa", () => {
    expect(validarRegras({ reservas_site: true })).toEqual({ campos: { reservas_site: true } });
    expect(validarRegras({ reservas_site: false })).toEqual({ campos: { reservas_site: false } });
    for (const ruim of ["true", 1, null, "sim"]) expect(validarRegras({ reservas_site: ruim })).toHaveProperty("erro");
  });
});

describe("edições prontas para o site (banco completo)", () => {
  let ed: string;
  beforeEach(async () => {
    definirBanco(banco);
    _reiniciarCacheDeCanais();
    await banco.limpar();
    ed = await criarEdicao(banco, { id: "2099-01-07" });
    await criarMesa(banco, "T1", 4);
  });

  it("padrão: nenhuma edição pronta, mesmo com mesas cadastradas", async () => {
    expect(await edicoesProntasParaSite()).toEqual([]);
    expect(await edicaoProntaParaSite(ed)).toBeNull();
  });

  it("completa e liberada: pronta; sem a liberação explícita, não", async () => {
    await liberarEdicaoParaSite(banco, ed);
    expect((await edicoesProntasParaSite()).map((p) => p.edicao.id)).toEqual([ed]);
    expect((await edicaoProntaParaSite(ed))?.mesasSite).toBe(1);
    await liberarEdicaoParaSite(banco, ed, { reservasSite: false });
    expect(await edicaoProntaParaSite(ed)).toBeNull();
  });

  it("qualquer campo obrigatório faltando fecha a edição", async () => {
    for (const sem of ["abertura", "reservas_ate", "tolerancia_min", "cancelamento_ate_horas", "capacidade_maxima", "consumacao_minima_centavos", "instrucoes_chegada", "horario"] as const) {
      await liberarEdicaoParaSite(banco, ed, { sem });
      expect(await edicaoProntaParaSite(ed), sem).toBeNull();
    }
  });

  it("o painel mostra exatamente o que falta para o site", async () => {
    await banco.sql("update edicoes set horario = '20h' where id = $1", [ed]);
    const painel = await carregarPainelDeRegras(ed);
    if (!painel.migrado) throw new Error("esperava banco migrado");
    expect(painel.parte2).toBe(true);
    expect(painel.prontidaoSite.pronta).toBe(false);
    expect(painel.prontidaoSite.faltando).toContain("liberação da edição para reservas pelo site");
    expect(painel.prontidaoSite.faltando).toContain("horário de abertura");
  });

  it("o administrador libera a edição pelo painel (API de salvar) e ela passa a valer para o site", async () => {
    await banco.sql("update edicoes set horario = '20h' where id = $1", [ed]);
    const r = await salvarRegrasECanais(ed, { regras: { abertura: "19h", reservas_ate: "2099-01-07T18:00:00.000Z", tolerancia_min: 15, cancelamento_ate_horas: 24, capacidade_maxima: 100, consumacao_minima_centavos: 0, instrucoes_chegada: "Chegue cedo.", reservas_site: true } }, "equipe@teste.com");
    expect(r).toEqual({ ok: true });
    expect(await edicaoProntaParaSite(ed)).not.toBeNull();
  });
});

describe("banco só com a parte 1 (antes de aplicar a parte 2)", () => {
  beforeEach(async () => {
    definirBanco(bancoParte1);
    _reiniciarCacheDeCanais();
    await bancoParte1.limpar();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("o site fica FECHADO para todas as edições, sem erro; o agente e o painel continuam lendo as regras", async () => {
    const ed = await criarEdicao(bancoParte1, { id: "2099-01-07", horario: "20h" });
    await criarMesa(bancoParte1, "T1", 4);
    await bancoParte1.sql("insert into edicoes_regras (edicao_id, abertura, reservas_ate, tolerancia_min, cancelamento_ate_horas, capacidade_maxima, consumacao_minima_centavos, instrucoes_chegada) values ($1,'19h','2099-01-07T18:00:00Z',15,24,100,0,'x')", [ed]);
    expect(await edicoesProntasParaSite()).toEqual([]);
    expect(await edicaoProntaParaSite(ed)).toBeNull();
    const painel = await carregarPainelDeRegras(ed);
    if (!painel.migrado) throw new Error("esperava migrado");
    expect(painel.parte2).toBe(false);
    expect(painel.regras.abertura).toBe("19h");
    expect(painel.regras.reservas_site).toBe(false);
  });

  it("salvar a liberação do site sem a parte 2 devolve 503 explicando, sem gravar nada", async () => {
    const ed = await criarEdicao(bancoParte1, { id: "2099-01-07" });
    const r = await salvarRegrasECanais(ed, { regras: { reservas_site: true } }, "equipe@teste.com");
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect((r as { erro: string }).erro).toContain("parte 2");
    expect((await bancoParte1.sql("select 1 from edicoes_regras")).length).toBe(0);
  });
});

describe("POST /api/reservas com o site aberto (ambiente de teste, tudo simulado)", () => {
  let ed: string;
  let t1: string;
  const corpo = (o: Record<string, unknown> = {}) => ({ nome: "Ana Teste", whatsapp: "(34) 99999-8888", pessoas: 2, edicao_id: ed, mesa_id: t1, turnstile: "ok", politica: true, ...o });
  const post = (c: Record<string, unknown>, ip = "10.0.0.1") => POST(new Request("http://localhost/api/reservas", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(c) }));
  const contarReservas = async () => (await banco.sql("select 1 from reservas")).length;

  function abrirSite() {
    vi.stubEnv("APP_AMBIENTE", "producao");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "chave-ficticia");
    vi.stubEnv("WHATSAPP_NUMERO_CASA", "5534991167064");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_QUINTA_HITS);
    vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio");
    vi.stubEnv("WHATSAPP_APP_SECRET", "segredo-ficticio");
    vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true");
    vi.stubEnv("WHATSAPP_SEND_ENABLED", "true");
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
  }

  beforeEach(async () => {
    definirBanco(banco);
    _reiniciarCacheDeCanais();
    _reiniciarLimites();
    await banco.limpar();
    ed = await criarEdicao(banco, { id: "2099-01-07" });
    t1 = await criarMesa(banco, "T1", 4);
    // Turnstile simulado: o único fetch permitido é a verificação, que responde sucesso. Nada sai para a rede.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("chave RESERVAS_SITE_ENABLED desligada: 503 antes de qualquer coisa, NENHUMA reserva e NENHUMA chamada externa", async () => {
    await liberarEdicaoParaSite(banco, ed);
    abrirSite();
    vi.stubEnv("RESERVAS_SITE_ENABLED", "");
    const r = await post(corpo());
    expect(r.status).toBe(503);
    expect((await r.json()).erro).toMatch(/abrirão em breve/);
    expect(await contarReservas()).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect((await mapa(new Request(`http://localhost/api/reservas/mapa?edicao=${ed}`))).status).toBe(503);
  });

  it("chave ligada, mas sem credenciais do WhatsApp: continua fechado (não haveria como confirmar)", async () => {
    await liberarEdicaoParaSite(banco, ed);
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    expect((await post(corpo())).status).toBe(503);
    expect(await contarReservas()).toBe(0);
  });

  it("aberto, edição completa e liberada: cria o pedido, gera o código e ele aparece no banco na hora com origem 'site'", async () => {
    await liberarEdicaoParaSite(banco, ed);
    abrirSite();
    const r = await post(corpo());
    expect(r.status).toBe(201);
    const j = await r.json();
    expect(j.codigo).toMatch(/^QH-\d{6}$/);
    expect(j.whatsappLink).toContain("wa.me/");
    const [linha] = await banco.sql<{ status: string; origem_reserva: string; codigo: string }>("select status, origem_reserva, codigo from reservas");
    expect(linha).toEqual({ status: "aguardando", origem_reserva: "site", codigo: j.codigo });
    expect((await banco.sql("select 1 from reservas_historico")).length).toBe(1); // histórico de status desde a criação
    expect(fetch).toHaveBeenCalledTimes(1); // só o Turnstile simulado; nenhuma chamada à Meta
    expect(String((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])).toContain("turnstile");
  });

  it("edição incompleta ou sem a liberação para o site: 409 e nenhuma reserva", async () => {
    abrirSite();
    expect((await post(corpo())).status).toBe(409); // sem regras
    await liberarEdicaoParaSite(banco, ed, { sem: "tolerancia_min" });
    expect((await post(corpo())).status).toBe(409);
    await liberarEdicaoParaSite(banco, ed, { reservasSite: false });
    expect((await post(corpo())).status).toBe(409);
    expect(await contarReservas()).toBe(0);
    expect((await mapa(new Request(`http://localhost/api/reservas/mapa?edicao=${ed}`))).status).toBe(404);
  });

  it("consentimento: sem a caixa da Política de Privacidade marcada, 400 e nenhuma reserva", async () => {
    await liberarEdicaoParaSite(banco, ed);
    abrirSite();
    for (const politica of [false, undefined, "true", 1]) {
      const r = await post(corpo({ politica }));
      expect(r.status, String(politica)).toBe(400);
    }
    expect(await contarReservas()).toBe(0);
  });

  it("dados mínimos: nome curto, telefone inválido, pessoas acima da mesa e mesa inválida são recusados", async () => {
    await liberarEdicaoParaSite(banco, ed);
    abrirSite();
    expect((await post(corpo({ nome: "A" }))).status).toBe(400);
    expect((await post(corpo({ whatsapp: "123" }))).status).toBe(400);
    expect((await post(corpo({ pessoas: 9 }))).status).toBe(400);
    expect((await post(corpo({ mesa_id: "nao-e-uuid" }))).status).toBe(400);
    expect(await contarReservas()).toBe(0);
  });

  it("a mesma mesa duas vezes: a segunda é 409 (duplicidade impedida pelo banco)", async () => {
    await liberarEdicaoParaSite(banco, ed);
    abrirSite();
    expect((await post(corpo())).status).toBe(201);
    expect((await post(corpo({ nome: "Bia", whatsapp: "(34) 98888-7777" }))).status).toBe(409);
    expect(await contarReservas()).toBe(1);
  });

  it("CONCORRÊNCIA pela última mesa: várias tentativas simultâneas, exatamente UMA vence", async () => {
    await liberarEdicaoParaSite(banco, ed);
    abrirSite();
    const tentativas = Array.from({ length: 8 }, (_, i) => post(corpo({ nome: `Cliente ${i}`, whatsapp: `(34) 9${String(8000 + i).padStart(4, "0")}-${String(1000 + i)}` }), `10.0.1.${i}`));
    const status = (await Promise.all(tentativas)).map((r) => r.status);
    expect(status.filter((s) => s === 201)).toHaveLength(1);
    expect(status.filter((s) => s === 409)).toHaveLength(7);
    expect(await contarReservas()).toBe(1);
  });

  it("limite por endereço: depois de 10 pedidos em 10 minutos, 429", async () => {
    await liberarEdicaoParaSite(banco, ed);
    abrirSite();
    for (let i = 0; i < 10; i++) await post(corpo({ politica: false }), "7.7.7.7");
    expect((await post(corpo(), "7.7.7.7")).status).toBe(429);
    expect(await contarReservas()).toBe(0);
  });

  it("armadilha do robô preenchida: finge sucesso e NÃO cria reserva", async () => {
    await liberarEdicaoParaSite(banco, ed);
    abrirSite();
    const r = await post(corpo({ site: "http://spam" }));
    expect(r.status).toBe(201);
    expect(await contarReservas()).toBe(0);
  });
});
