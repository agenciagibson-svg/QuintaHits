import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { liberarEdicaoParaSite } from "./helpers/cenarios";

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});
vi.mock("@/lib/casaSessao", () => ({ exigirSessaoCasa: async () => null, atorDaCasa: async () => "porta@teste.com", casasDaSessao: async () => ["quinta-hits", "fogo-e-brasa"] }));
vi.mock("@/lib/adminSessao", () => ({ exigirSessao: async () => null, atorDaSessao: async () => "equipe@teste.com" }));
vi.mock("@/lib/pushCasa", () => ({ notificarCasa: vi.fn(async () => ({ enviados: 0, removidos: 0 })) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "www.quintahits.com.br", "x-forwarded-proto": "https" }) }));

import { emitirIngresso, lerMeuIngresso, vendaDeIngressos } from "@/lib/ingressos";
import { registrarChegada } from "@/lib/checkin";
import { POST as postIngresso } from "@/app/api/ingressos/route";
import { POST as postReserva } from "@/app/api/reservas/route";
import { GET as listarAdmin, PATCH as mudarAdmin } from "@/app/api/admin/ingressos/route";
import { _reiniciarLimites } from "@/lib/limiteTaxa";

let banco: BancoTeste;
beforeAll(async () => { banco = await criarBancoTeste(); });
afterAll(async () => { definirBanco(null); await banco.pg.close(); });

const FB = "fogo-e-brasa";
const DATA = "2099-01-07";
const ED = `${DATA}_${FB}`;
const AS_20H = new Date("2099-01-07T23:00:00Z");

async function noiteComIngresso(o: { capacidade?: number; valor?: number | null } = {}) {
  await banco.sql("insert into casas (id, nome) values ($1, 'Fogo e Brasa') on conflict (id) do nothing", [FB]);
  await banco.sql("insert into edicoes (id, data, casa, artista, local, status) values ($1, $2, $3, '[TESTE] Atração', 'Fogo e Brasa', 'confirmada')", [ED, DATA, FB]);
  // A noite só abre no site com ao menos uma mesa oferecida (regra de sempre).
  await banco.sql("insert into mesas (casa, numero, lugares, area) values ($1, '99', 4, 'Salão')", [FB]);
  await liberarEdicaoParaSite(banco, ED);
  await banco.sql("update edicoes_regras set capacidade_maxima = $2, ingresso_centavos = $3 where edicao_id = $1", [ED, o.capacidade ?? 10, o.valor === undefined ? 2500 : o.valor]);
}
async function mesaFB(numero: string, lugares = 4) {
  const [m] = await banco.sql<{ id: string }>("insert into mesas (casa, numero, lugares, area) values ($1, $2, $3, 'Deck') returning id", [FB, numero, lugares]);
  return m.id;
}
const pedir = (o: Record<string, unknown> = {}, ip = "10.0.0.1") =>
  postIngresso(new Request("http://localhost/api/ingressos", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ edicao_id: ED, nome: "Ana Teste", whatsapp: "(34) 99999-8888", quantidade: 2, turnstile: "ok", politica: true, ...o }) }));

beforeEach(async () => {
  definirBanco(banco);
  await banco.limpar();
  _reiniciarLimites();
  vi.unstubAllEnvs();
  vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
});

describe("emissão no banco (trava de lotação)", () => {
  it("emite confirmado com o valor da noite e o código da casa; para na capacidade", async () => {
    await noiteComIngresso({ capacidade: 5 });
    const a = await emitirIngresso({ edicaoId: ED, nome: "Ana", whatsapp: "34999998888", quantidade: 3, ipHash: null });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.codigo).toMatch(/^FB-\d{6}$/);
    const [linha] = await banco.sql<{ status: string; valor_unitario_centavos: number }>("select status, valor_unitario_centavos from ingressos where id = $1", [a.id]);
    expect(linha).toEqual({ status: "confirmado", valor_unitario_centavos: 2500 });
    expect(await emitirIngresso({ edicaoId: ED, nome: "Bia", whatsapp: "34999997777", quantidade: 3, ipHash: null })).toEqual({ ok: false, motivo: "lotado", restantes: 2 });
    expect((await emitirIngresso({ edicaoId: ED, nome: "Bia", whatsapp: "34999997777", quantidade: 2, ipHash: null })).ok).toBe(true);
    expect(await vendaDeIngressos(ED)).toEqual({ valorCentavos: 2500, restantes: 0 });
  });

  it("pessoas das reservas de mesa entram na mesma lotação; noite sem valor não vende", async () => {
    await noiteComIngresso({ capacidade: 6 });
    const mesa = await mesaFB("1");
    await banco.sql("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, status) values ($1, $2, 'Mesa', '34911112222', 4, 'confirmada')", [ED, mesa]);
    expect(await vendaDeIngressos(ED)).toEqual({ valorCentavos: 2500, restantes: 2 });
    await banco.sql("update edicoes_regras set ingresso_centavos = null where edicao_id = $1", [ED]);
    expect(await vendaDeIngressos(ED)).toBeNull();
    expect(await emitirIngresso({ edicaoId: ED, nome: "Ana", whatsapp: "34999998888", quantidade: 1, ipHash: null })).toEqual({ ok: false, motivo: "indisponivel" });
  });
});

describe("POST /api/ingressos", () => {
  it("emite pelo site e a página do ingresso mostra quantidade, total e QR", async () => {
    await noiteComIngresso();
    const res = await pedir();
    expect(res.status).toBe(201);
    const j = await res.json();
    const meu = await lerMeuIngresso(j.id);
    expect(meu).toMatchObject({ quantidade: 2, totalCentavos: 5000, status: "confirmado", valeQr: true, primeiroNome: "Ana" });
  });

  it("recusa sem política, sem nome, quantidade fora de 1–10, noite lotada e site desligado", async () => {
    await noiteComIngresso({ capacidade: 3 });
    expect((await pedir({ politica: false })).status).toBe(400);
    expect((await pedir({ nome: "" })).status).toBe(400);
    expect((await pedir({ quantidade: 11 })).status).toBe(400);
    expect((await pedir({ quantidade: 0 })).status).toBe(400);
    const lotado = await pedir({ quantidade: 4 });
    expect(lotado.status).toBe(409);
    expect((await lotado.json()).erro).toContain("Restam só 3");
    vi.stubEnv("RESERVAS_SITE_ENABLED", "");
    expect((await pedir()).status).toBe(503);
    expect(await banco.sql("select id from ingressos")).toHaveLength(0);
  });

  it("robô (campo invisível) não gera ingresso; mesmo WhatsApp tem limite por noite", async () => {
    await noiteComIngresso({ capacidade: 100 });
    expect((await pedir({ site: "http://spam" })).status).toBe(201);
    expect(await banco.sql("select id from ingressos")).toHaveLength(0);
    for (let i = 0; i < 3; i++) expect((await pedir({ quantidade: 1 }, `10.0.1.${i}`)).status).toBe(201);
    expect((await pedir({ quantidade: 1 }, "10.0.2.1")).status).toBe(409);
  });

  it("reserva de mesa respeita a lotação dividida com os ingressos", async () => {
    await noiteComIngresso({ capacidade: 4 });
    const mesa = await mesaFB("2");
    await emitirIngresso({ edicaoId: ED, nome: "Ana", whatsapp: "34999998888", quantidade: 3, ipHash: null });
    const res = await postReserva(new Request("http://localhost/api/reservas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nome: "Bia Teste", whatsapp: "(34) 99999-7777", pessoas: 2, edicao_id: ED, mesa_id: mesa, turnstile: "ok", politica: true }) }));
    expect(res.status).toBe(409);
    expect((await res.json()).erro).toContain("Restam só 1");
  });
});

describe("portaria: o QR do ingresso vale uma entrada", () => {
  it("QR registra a entrada; segunda leitura = QR já usado; código digitado também acha; cancelado não entra", async () => {
    await noiteComIngresso();
    const a = await emitirIngresso({ edicaoId: ED, nome: "Ana", whatsapp: "34999998888", quantidade: 2, ipHash: null });
    if (!a.ok) throw new Error("não emitiu");
    const r1 = await registrarChegada(`https://www.quintahits.com.br/casa/checkin/${a.id}`, "porta@teste.com", { casas: ["fogo-e-brasa"], agora: AS_20H });
    expect(r1).toMatchObject({ ok: true, jaTinhaChegado: false, reserva: { ingresso: true, pessoas: 2, mesa: "" } });
    const r2 = await registrarChegada(a.codigo, "porta@teste.com", { casas: ["fogo-e-brasa"], agora: AS_20H });
    expect(r2).toMatchObject({ ok: true, jaTinhaChegado: true });

    const b = await emitirIngresso({ edicaoId: ED, nome: "Bia", whatsapp: "34999997777", quantidade: 1, ipHash: null });
    if (!b.ok) throw new Error("não emitiu");
    await banco.sql("update ingressos set status = 'cancelado' where id = $1", [b.id]);
    expect(await registrarChegada(b.id, "porta@teste.com", { casas: ["fogo-e-brasa"], agora: AS_20H })).toMatchObject({ ok: false, erro: "Esse ingresso foi cancelado." });
    // Outra casa não lê o ingresso do Fogo e Brasa.
    const c = await emitirIngresso({ edicaoId: ED, nome: "Cris", whatsapp: "34999996666", quantidade: 1, ipHash: null });
    if (!c.ok) throw new Error("não emitiu");
    expect(await registrarChegada(c.id, "porta@teste.com", { casas: ["harley-grill"], agora: AS_20H })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("painel", () => {
  it("lista os ingressos com o valor, cancela e grava o valor da noite", async () => {
    await noiteComIngresso();
    const a = await emitirIngresso({ edicaoId: ED, nome: "Ana", whatsapp: "34999998888", quantidade: 2, ipHash: null });
    if (!a.ok) throw new Error("não emitiu");
    const lista = await (await listarAdmin(new Request(`http://localhost/api/admin/ingressos?edicao=${ED}`))).json();
    expect(lista).toMatchObject({ migrado: true, valor_centavos: 2500, capacidade: 10 });
    expect(lista.ingressos).toHaveLength(1);
    const patch = (b: unknown) => mudarAdmin(new Request("http://localhost/api/admin/ingressos", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }));
    expect((await patch({ id: a.id, status: "cancelado" })).status).toBe(200);
    expect((await vendaDeIngressos(ED))?.restantes).toBe(10);
    expect((await patch({ edicao: ED, valor_centavos: 3000 })).status).toBe(200);
    expect((await vendaDeIngressos(ED))?.valorCentavos).toBe(3000);
    expect((await patch({ edicao: ED, valor_centavos: -5 })).status).toBe(400);
  });
});
