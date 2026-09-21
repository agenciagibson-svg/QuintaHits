import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { criarEdicao, criarMesa } from "./helpers/cenarios";
import { avaliarProntidao, validarRegras, REGRAS_VAZIAS, type RegrasEdicao } from "@/lib/regrasEdicao";
import type { Edicao } from "@/lib/edicao";

const sessao = vi.hoisted(() => ({ autenticado: true }));

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});
vi.mock("@/lib/adminSessao", () => ({
  exigirSessao: async () => (sessao.autenticado ? null : NextResponse.json({ erro: "Não autenticado." }, { status: 401 })),
}));

import { GET, PUT } from "@/app/api/admin/edicoes/[id]/regras/route";
import { _reiniciarCacheDeCanais } from "@/lib/disponibilidade";
import { edicoesProntasParaAgente } from "@/lib/regras";

const AGORA = new Date("2026-09-21T15:00:00Z");
const edicao = (o: Partial<Edicao> = {}): Edicao => ({ id: "2026-10-08", data: "2026-10-08", artista: "X", instagram: "", tema: "", genero: "", horario: "20h", local: "Florindos Bar", status: "confirmada", destaque: "", ...o });
const regrasCompletas = (o: Partial<RegrasEdicao> = {}): RegrasEdicao => ({
  ...REGRAS_VAZIAS, abertura: "19h", reservas_ate: "2026-10-08T18:00:00.000Z", tolerancia_min: 15, cancelamento_ate_horas: 24,
  capacidade_maxima: 120, consumacao_minima_centavos: 0, instrucoes_chegada: "Chegue com antecedência.", atendimento_automatico: true, ...o,
});

describe("validarRegras", () => {
  it("aceita valores válidos e normaliza (texto aparado, datas em ISO, vazio vira 'não definido')", () => {
    const r = validarRegras({ abertura: " 19h30 ", reservas_ate: "2026-10-08T15:00:00-03:00", tolerancia_min: "15", cancelamento_ate_horas: 24, capacidade_maxima: "120", consumacao_minima_centavos: 0, preco_centavos: "", instrucoes_chegada: "  Entrada pela lateral ", atendimento_automatico: true });
    expect(r).toEqual({ campos: { abertura: "19h30", reservas_ate: "2026-10-08T18:00:00.000Z", tolerancia_min: 15, cancelamento_ate_horas: 24, capacidade_maxima: 120, consumacao_minima_centavos: 0, preco_centavos: null, instrucoes_chegada: "Entrada pela lateral", atendimento_automatico: true } });
  });

  it("campo ausente não muda; campo vazio volta a 'não definido' (nunca vira valor padrão)", () => {
    expect(validarRegras({})).toEqual({ campos: {} });
    expect(validarRegras({ tolerancia_min: "", abertura: "", reservas_ate: null, observacoes: "" })).toEqual({ campos: { tolerancia_min: null, abertura: null, reservas_ate: null, observacoes: "" } });
  });

  it("recusa horário, números, data e tipos inválidos", () => {
    for (const ruim of [{ abertura: "25h" }, { abertura: "7" }, { reservas_ate: "ontem" }, { tolerancia_min: -1 }, { tolerancia_min: 1.5 }, { tolerancia_min: "abc" }, { capacidade_maxima: 0 },
      { consumacao_minima_centavos: -5 }, { atendimento_automatico: "sim" }, { instrucoes_chegada: "x".repeat(1001) }, { observacoes: 5 }]) {
      expect(validarRegras(ruim), JSON.stringify(ruim)).toHaveProperty("erro");
    }
    expect(validarRegras(null)).toHaveProperty("erro");
    expect(validarRegras([])).toHaveProperty("erro");
  });
});

describe("avaliarProntidao", () => {
  const pronta = (o: Partial<Parameters<typeof avaliarProntidao>[0]> = {}) => avaliarProntidao({ edicao: edicao(), regras: regrasCompletas(), mesasWhatsapp: 3, agora: AGORA, ...o });

  it("tudo preenchido, liberada e com mesa no WhatsApp: pronta", () => {
    expect(pronta()).toEqual({ pronta: true, faltando: [] });
  });

  it("sem nenhuma regra cadastrada: NÃO pronta e lista o que falta (nada é inventado)", () => {
    const r = pronta({ regras: null, mesasWhatsapp: 0 });
    expect(r.pronta).toBe(false);
    for (const item of ["horário de abertura", "prazo final para reservar", "tolerância", "prazo de cancelamento", "capacidade máxima", "consumação mínima", "instruções de chegada", "ao menos uma mesa liberada para o WhatsApp", "liberação da edição"]) {
      expect(r.faltando.join(" | ")).toContain(item);
    }
  });

  it.each([
    ["abertura", { abertura: null }, "horário de abertura"],
    ["prazo final", { reservas_ate: null }, "prazo final para reservar"],
    ["tolerância", { tolerancia_min: null }, "tolerância"],
    ["cancelamento", { cancelamento_ate_horas: null }, "prazo de cancelamento"],
    ["capacidade", { capacidade_maxima: null }, "capacidade máxima"],
    ["consumação indefinida", { consumacao_minima_centavos: null }, "consumação mínima"],
    ["instruções", { instrucoes_chegada: null }, "instruções de chegada"],
    ["liberação", { atendimento_automatico: false }, "liberação da edição"],
  ])("falta %s ⇒ não pronta", (_n, mudanca, texto) => {
    const r = pronta({ regras: regrasCompletas(mudanca as Partial<RegrasEdicao>) });
    expect(r.pronta).toBe(false);
    expect(r.faltando).toHaveLength(1);
    expect(r.faltando[0]).toContain(texto);
  });

  it("consumação 0 (sem consumação) conta como definida; nulo não", () => {
    expect(pronta({ regras: regrasCompletas({ consumacao_minima_centavos: 0 }) }).pronta).toBe(true);
  });

  it("dados da própria edição: horário do evento, local, edição passada, cancelada, prazo vencido", () => {
    expect(pronta({ edicao: edicao({ horario: "" }) }).faltando).toEqual(["horário do evento"]);
    expect(pronta({ edicao: edicao({ local: " " }) }).faltando).toEqual(["local do evento"]);
    expect(pronta({ edicao: edicao({ data: "2026-09-10" }) }).faltando).toContain("edição que já passou");
    expect(pronta({ edicao: edicao({ status: "cancelada" }) }).faltando).toContain("edição cancelada ou já realizada");
    expect(pronta({ regras: regrasCompletas({ reservas_ate: "2026-09-21T10:00:00.000Z" }) }).faltando).toEqual(["prazo final para reservar (já passou)"]);
    expect(pronta({ edicao: null }).faltando).toEqual(["edição não encontrada"]);
  });
});

let banco: BancoTeste;
let bancoAntigo: BancoTeste;
beforeAll(async () => {
  banco = await criarBancoTeste();
  bancoAntigo = await criarBancoTeste({ migracao: false });
});
afterAll(async () => {
  definirBanco(null);
  await banco.pg.close();
  await bancoAntigo.pg.close();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const put = (id: string, corpo: unknown) => PUT(new Request("http://localhost/x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }), ctx(id));
const get = (id: string) => GET(new Request("http://localhost/x"), ctx(id));

describe("API do painel: regras e canais por edição", () => {
  let ed: string;
  let t1: string;
  let t2: string;
  beforeEach(async () => {
    definirBanco(banco);
    sessao.autenticado = true;
    _reiniciarCacheDeCanais();
    await banco.limpar();
    ed = await criarEdicao(banco, { horario: "20h" });
    t1 = await criarMesa(banco, "T1", 4);
    t2 = await criarMesa(banco, "T2", 6);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  const corpoCompleto = () => ({
    regras: { abertura: "19h", reservas_ate: "2099-01-07T15:00:00-03:00", tolerancia_min: 15, cancelamento_ate_horas: 24, capacidade_maxima: 120, consumacao_minima_centavos: 5000, instrucoes_chegada: "Instruções de teste.", atendimento_automatico: true },
    mesas: [
      { mesa_id: t1, disponivel_site: true, disponivel_whatsapp: true, disponivel_admin: true, lugares_ajuste: null },
      { mesa_id: t2, disponivel_site: true, disponivel_whatsapp: false, disponivel_admin: true, lugares_ajuste: 5 },
    ],
  });

  it("sem sessão: 401 em GET e PUT, e nada é gravado", async () => {
    sessao.autenticado = false;
    expect((await get(ed)).status).toBe(401);
    expect((await put(ed, corpoCompleto())).status).toBe(401);
    expect((await banco.sql("select 1 from edicoes_regras")).length).toBe(0);
  });

  it("id de edição inválido: 400", async () => {
    expect((await get("nao-e-data")).status).toBe(400);
    expect((await put("2026-13-40", {})).status).toBe(400);
  });

  it("edição sem regras: mostra NÃO pronta, com o que falta, e as mesas com o padrão de canais", async () => {
    const j = await (await get(ed)).json();
    expect(j.migrado).toBe(true);
    expect(j.prontidao.pronta).toBe(false);
    expect(j.prontidao.faltando).toContain("horário de abertura");
    expect(j.regras).toMatchObject({ abertura: null, tolerancia_min: null, atendimento_automatico: false });
    expect(j.mesas.map((m: { numero: string; disponivel_site: boolean; disponivel_whatsapp: boolean }) => [m.numero, m.disponivel_site, m.disponivel_whatsapp])).toEqual([["T1", true, false], ["T2", true, false]]);
  });

  it("PUT com regras completas e ao menos uma mesa no WhatsApp: a edição fica PRONTA", async () => {
    const r = await put(ed, corpoCompleto());
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.prontidao).toEqual({ pronta: true, faltando: [] });
    expect(j.regras).toMatchObject({ abertura: "19h", tolerancia_min: 15, capacidade_maxima: 120, consumacao_minima_centavos: 5000, atendimento_automatico: true });
    const t2json = j.mesas.find((m: { numero: string }) => m.numero === "T2");
    expect(t2json).toMatchObject({ disponivel_whatsapp: false, lugares_ajuste: 5, lugares_da_mesa: 6 });
  });

  it("PUT parcial só muda o que foi enviado: desligar a liberação não apaga as outras regras", async () => {
    await put(ed, corpoCompleto());
    const j = await (await put(ed, { regras: { atendimento_automatico: false } })).json();
    expect(j.prontidao.pronta).toBe(false);
    expect(j.prontidao.faltando).toEqual(["liberação da edição para o atendimento automático"]);
    expect(j.regras).toMatchObject({ abertura: "19h", tolerancia_min: 15, instrucoes_chegada: "Instruções de teste." });
  });

  it("valor inválido: 400 e NADA é salvo, nem as mesas do mesmo pedido", async () => {
    const corpo = corpoCompleto();
    (corpo.regras as Record<string, unknown>).abertura = "25h";
    expect((await put(ed, corpo)).status).toBe(400);
    expect((await banco.sql("select 1 from edicoes_regras")).length).toBe(0);
    expect((await banco.sql("select 1 from edicoes_mesas")).length).toBe(0);
    const ruim = { mesas: [{ mesa_id: t1, disponivel_site: "sim", disponivel_whatsapp: true, disponivel_admin: true }] };
    expect((await put(ed, ruim)).status).toBe(400);
  });

  it("edição ou mesa inexistente: 404", async () => {
    expect((await put("2098-05-05", corpoCompleto())).status).toBe(404);
    const corpo = corpoCompleto();
    corpo.mesas[0].mesa_id = "00000000-0000-4000-8000-000000000000";
    expect((await put(ed, { mesas: corpo.mesas })).status).toBe(404);
  });

  it("registra auditoria só com NOMES de campos e contagens, nunca os valores", async () => {
    await put(ed, corpoCompleto());
    const linhas = await banco.sql<{ acao: string; ator: string; detalhe: Record<string, unknown> }>("select acao, ator, detalhe from auditoria order by id");
    expect(linhas.map((l) => l.acao)).toEqual(["regras_edicao_atualizadas", "canais_mesas_atualizados"]);
    expect(linhas[0].detalhe.campos).toEqual(expect.arrayContaining(["abertura", "tolerancia_min"]));
    const bruto = JSON.stringify(linhas);
    expect(bruto).not.toContain("Instruções de teste");
    expect(bruto).not.toContain("5000");
  });

  it("a mudança de canais vale para o estoque único: T2 sai do WhatsApp mas continua no site", async () => {
    await put(ed, corpoCompleto());
    const { mesasLivres } = await import("@/lib/disponibilidade");
    expect((await mesasLivres(ed, "whatsapp")).map((m) => m.numero)).toEqual(["T1"]);
    expect((await mesasLivres(ed, "site")).map((m) => m.numero)).toEqual(["T1", "T2"]);
  });
});

describe("edicoesProntasParaAgente", () => {
  beforeEach(async () => {
    definirBanco(banco);
    _reiniciarCacheDeCanais();
    await banco.limpar();
  });

  it("só devolve edições futuras, abertas, com regras completas, liberadas e com mesa no WhatsApp", async () => {
    const pronta = await criarEdicao(banco, { id: "2099-01-07", horario: "20h" });
    await criarEdicao(banco, { id: "2099-01-14", horario: "20h" }); // sem regras
    await criarEdicao(banco, { id: "2099-01-21", horario: "20h", status: "cancelada" });
    await criarEdicao(banco, { id: "2000-01-06", horario: "20h" }); // passada
    const t1 = await criarMesa(banco, "T1", 4);
    for (const id of [pronta, "2099-01-21", "2000-01-06"]) {
      await banco.sql("insert into edicoes_regras (edicao_id, abertura, reservas_ate, tolerancia_min, cancelamento_ate_horas, capacidade_maxima, consumacao_minima_centavos, instrucoes_chegada, atendimento_automatico) values ($1,'19h','2099-01-07T15:00:00Z',15,24,100,0,'x',true)", [id]);
      await banco.sql("insert into edicoes_mesas (edicao_id, mesa_id, disponivel_whatsapp) values ($1,$2,true)", [id, t1]);
    }
    const lista = await edicoesProntasParaAgente();
    expect(lista.map((p) => p.edicao.id)).toEqual(["2099-01-07"]);
    expect(lista[0].mesasWhatsapp).toBe(1);
  });

  it("edição completa mas SEM mesa liberada para o WhatsApp: fica de fora", async () => {
    const id = await criarEdicao(banco, { id: "2099-01-07", horario: "20h" });
    await criarMesa(banco, "T1", 4);
    await banco.sql("insert into edicoes_regras (edicao_id, abertura, reservas_ate, tolerancia_min, cancelamento_ate_horas, capacidade_maxima, consumacao_minima_centavos, instrucoes_chegada, atendimento_automatico) values ($1,'19h','2099-01-07T15:00:00Z',15,24,100,0,'x',true)", [id]);
    expect(await edicoesProntasParaAgente()).toEqual([]);
  });
});

describe("SEM a migração (produção hoje)", () => {
  beforeEach(async () => {
    definirBanco(bancoAntigo);
    sessao.autenticado = true;
    _reiniciarCacheDeCanais();
    await bancoAntigo.limpar();
    await criarEdicao(bancoAntigo, { horario: "20h" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("GET devolve { migrado: false } (o painel mostra um aviso) e PUT devolve 503 sem quebrar nada", async () => {
    expect(await (await get("2099-01-07")).json()).toEqual({ migrado: false });
    expect((await put("2099-01-07", { regras: { abertura: "19h" } })).status).toBe(503);
  });

  it("a lista de edições prontas para o agente vem vazia", async () => {
    expect(await edicoesProntasParaAgente()).toEqual([]);
  });
});
