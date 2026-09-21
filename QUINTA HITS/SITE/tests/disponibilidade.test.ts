import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { criarEdicao, criarMesa, criarPedidoAguardando, liberarEdicaoParaSite } from "./helpers/cenarios";

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});

import { _reiniciarCacheDeCanais, estoqueDaEdicao, mesasDoCanal, mesasLivres, verificarMesa } from "@/lib/disponibilidade";
import { mapaDaEdicao } from "@/lib/reservas";
import { POST } from "@/app/api/reservas/route";

let banco: BancoTeste;
let bancoAntigo: BancoTeste; // sem a migração: é o estado da produção hoje
beforeAll(async () => {
  banco = await criarBancoTeste();
  bancoAntigo = await criarBancoTeste({ migracao: false });
});
afterAll(async () => {
  definirBanco(null);
  await banco.pg.close();
  await bancoAntigo.pg.close();
});

const canais = (b: BancoTeste, edicaoId: string, mesaId: string, site: boolean, whatsapp: boolean, admin: boolean, override: number | null = null) =>
  b.sql("insert into edicoes_mesas (edicao_id, mesa_id, disponivel_site, disponivel_whatsapp, disponivel_admin, lugares_override) values ($1,$2,$3,$4,$5,$6)", [edicaoId, mesaId, site, whatsapp, admin, override]);

const numeros = (l: { numero: string }[]) => l.map((m) => m.numero).sort();

describe("disponibilidade única por canal (com a migração)", () => {
  let edicao: string;
  beforeEach(async () => {
    definirBanco(banco);
    _reiniciarCacheDeCanais();
    await banco.limpar();
    edicao = await criarEdicao(banco);
  });

  it("sem nenhuma configuração: site e painel oferecem todas as mesas ativas; o WhatsApp não oferece nenhuma", async () => {
    await criarMesa(banco, "T1"); await criarMesa(banco, "T2");
    expect(numeros(await mesasLivres(edicao, "site"))).toEqual(["T1", "T2"]);
    expect(numeros(await mesasLivres(edicao, "admin"))).toEqual(["T1", "T2"]);
    expect(await mesasLivres(edicao, "whatsapp")).toEqual([]);
  });

  it("cada canal vê só o que foi liberado para ele; 'indisponível' (três desligados) some de todos", async () => {
    const [t1, t2, t3, t4] = [await criarMesa(banco, "T1"), await criarMesa(banco, "T2"), await criarMesa(banco, "T3"), await criarMesa(banco, "T4")];
    await canais(banco, edicao, t1, true, true, true);
    await canais(banco, edicao, t2, false, true, true);
    await canais(banco, edicao, t3, false, false, false);
    await canais(banco, edicao, t4, true, false, false);
    expect(numeros(await mesasLivres(edicao, "site"))).toEqual(["T1", "T4"]);
    expect(numeros(await mesasLivres(edicao, "whatsapp"))).toEqual(["T1", "T2"]);
    expect(numeros(await mesasLivres(edicao, "admin"))).toEqual(["T1", "T2"]);
  });

  it("mesa desativada globalmente (ativa = false) some de todos os canais", async () => {
    const t1 = await criarMesa(banco, "T1");
    await canais(banco, edicao, t1, true, true, true);
    await banco.sql("update mesas set ativa = false where id = $1", [t1]);
    for (const c of ["site", "whatsapp", "admin"] as const) expect(await mesasLivres(edicao, c)).toEqual([]);
  });

  it("ESTOQUE ÚNICO: a reserva feita por um canal tira a mesa de TODOS os outros", async () => {
    const t1 = await criarMesa(banco, "T1"); const t2 = await criarMesa(banco, "T2");
    await canais(banco, edicao, t1, true, true, true);
    await canais(banco, edicao, t2, true, true, true);
    await criarPedidoAguardando(banco, { edicaoId: edicao, mesaId: t1 }); // reserva do SITE
    for (const c of ["site", "whatsapp", "admin"] as const) expect(numeros(await mesasLivres(edicao, c))).toEqual(["T2"]);
    const est = await estoqueDaEdicao(edicao);
    expect(est.ocupadas.has(t1)).toBe(true);
    // ...e continua valendo para reserva vinda de outra origem
    await banco.sql("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, origem_reserva, status) values ($1,$2,'[TESTE]','34999998888',2,'whatsapp_agent','confirmada')", [edicao, t2]);
    for (const c of ["site", "whatsapp", "admin"] as const) expect(await mesasLivres(edicao, c)).toEqual([]);
  });

  it("mesa não oferecida ao WhatsApp, mas reservada pelo site, continua no MESMO estoque", async () => {
    const t1 = await criarMesa(banco, "T1");
    await canais(banco, edicao, t1, true, false, true);
    expect(await mesasLivres(edicao, "whatsapp")).toEqual([]);
    await criarPedidoAguardando(banco, { edicaoId: edicao, mesaId: t1 });
    expect(await mesasLivres(edicao, "admin")).toEqual([]);
    expect(await mesasLivres(edicao, "site")).toEqual([]);
  });

  it("pedido vencido é expirado antes de contar: a mesa volta a ficar livre para todos", async () => {
    const t1 = await criarMesa(banco, "T1");
    await canais(banco, edicao, t1, true, true, true);
    await criarPedidoAguardando(banco, { edicaoId: edicao, mesaId: t1, expiraEmMin: -1 });
    expect(numeros(await mesasLivres(edicao, "whatsapp"))).toEqual(["T1"]);
  });

  it("ajuste de lugares da edição vale para todos os canais e filtra pelo tamanho do grupo", async () => {
    const t1 = await criarMesa(banco, "T1", 10);
    await canais(banco, edicao, t1, true, true, true, 2);
    expect(numeros(await mesasLivres(edicao, "whatsapp", 2))).toEqual(["T1"]);
    expect(await mesasLivres(edicao, "whatsapp", 3)).toEqual([]);
    expect(await mesasLivres(edicao, "site", 3)).toEqual([]);
    expect((await estoqueDaEdicao(edicao)).mesas[0].lugares).toBe(2);
  });

  it("verificarMesa explica o motivo: inexistente, canal indisponível, lugares insuficientes, ocupada, ok", async () => {
    const t1 = await criarMesa(banco, "T1", 4); const t2 = await criarMesa(banco, "T2", 4);
    await canais(banco, edicao, t1, true, true, true);
    await canais(banco, edicao, t2, false, true, true);
    expect((await verificarMesa(edicao, "00000000-0000-0000-0000-000000000000", "site", 2))).toMatchObject({ ok: false, motivo: "mesa_inexistente" });
    expect((await verificarMesa(edicao, t2, "site", 2))).toMatchObject({ ok: false, motivo: "canal_indisponivel" });
    expect((await verificarMesa(edicao, t1, "site", 5))).toMatchObject({ ok: false, motivo: "lugares_insuficientes" });
    expect((await verificarMesa(edicao, t1, "whatsapp", 2))).toMatchObject({ ok: true });
    await criarPedidoAguardando(banco, { edicaoId: edicao, mesaId: t1 });
    expect((await verificarMesa(edicao, t1, "whatsapp", 2))).toMatchObject({ ok: false, motivo: "ocupada" });
  });

  it("mapa do SITE: sem configuração é idêntico ao de sempre; com configuração esconde a mesa desligada para o site", async () => {
    const t1 = await criarMesa(banco, "T1", 4); const t2 = await criarMesa(banco, "T2", 6);
    const antes = await mapaDaEdicao(edicao);
    expect(antes.mesas.map((m) => m.numero)).toEqual(["T1", "T2"]);
    expect(antes.mesas[0]).toEqual({ id: t1, numero: "T1", lugares: 4, area: "Salão", x: 50, y: 50 });
    expect(antes.ocupadas).toEqual([]);
    await canais(banco, edicao, t2, false, true, true);
    await criarPedidoAguardando(banco, { edicaoId: edicao, mesaId: t1 });
    const depois = await mapaDaEdicao(edicao);
    expect(depois.mesas.map((m) => m.numero)).toEqual(["T1"]);
    expect(depois.ocupadas).toEqual([t1]);
  });

  it("mesasDoCanal devolve também as ocupadas (o mapa do site as mostra em cinza)", async () => {
    const t1 = await criarMesa(banco, "T1");
    await criarPedidoAguardando(banco, { edicaoId: edicao, mesaId: t1 });
    const est = await estoqueDaEdicao(edicao);
    expect(mesasDoCanal(est, "site").map((m) => m.numero)).toEqual(["T1"]);
  });
});

describe("POST /api/reservas (site) com a disponibilidade única", () => {
  let edicao: string;
  const post = (corpo: Record<string, unknown>) =>
    POST(new Request("http://localhost/api/reservas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nome: "Ana Teste", whatsapp: "(34) 99999-8888", pessoas: 2, edicao_id: edicao, turnstile: "ok", ...corpo }) }));

  beforeEach(async () => {
    definirBanco(banco);
    _reiniciarCacheDeCanais();
    await banco.limpar();
    edicao = await criarEdicao(banco);
    await liberarEdicaoParaSite(banco, edicao);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "chave-ficticia");
    vi.stubEnv("WHATSAPP_NUMERO_CASA", "5534991167064");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1352142871312651");
    vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio");
    vi.stubEnv("WHATSAPP_APP_SECRET", "segredo-ficticio");
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    vi.stubEnv("WHATSAPP_SEND_ENABLED", "true"); vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true"); // sem o envio ligado o site não libera reservas
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
  });

  it("cria o pedido do site como sempre: aguardando, origem 'site', com código", async () => {
    const t1 = await criarMesa(banco, "T1", 4);
    const r = await post({ mesa_id: t1 });
    expect(r.status).toBe(201);
    const j = await r.json();
    expect(j.codigo).toMatch(/^QH-\d{6}$/);
    const [linha] = await banco.sql<{ status: string; origem_reserva: string }>("select status, origem_reserva from reservas");
    expect(linha).toEqual({ status: "aguardando", origem_reserva: "site" });
  });

  it("mesa desligada para o SITE: 404, mesmo existindo e estando livre", async () => {
    const t1 = await criarMesa(banco, "T1", 4);
    await criarMesa(banco, "T2", 4); // outra mesa segue oferecida ao site: a edição continua pronta
    await canais(banco, edicao, t1, false, true, true);
    const r = await post({ mesa_id: t1 });
    expect(r.status).toBe(404);
    expect((await banco.sql("select 1 from reservas")).length).toBe(0);
  });

  it("mesa liberada só para o WhatsApp: o site não a reserva", async () => {
    const t1 = await criarMesa(banco, "T1", 4);
    await criarMesa(banco, "T2", 4);
    await canais(banco, edicao, t1, false, true, false);
    expect((await post({ mesa_id: t1 })).status).toBe(404);
  });

  it("ajuste de lugares da edição: grupo maior que o ajuste leva 400 com a capacidade efetiva", async () => {
    const t1 = await criarMesa(banco, "T1", 10);
    await canais(banco, edicao, t1, true, true, true, 2);
    const r = await post({ mesa_id: t1, pessoas: 3 });
    expect(r.status).toBe(400);
    expect((await r.json()).erro).toContain("até 2 pessoas");
  });

  it("mesa já segurada por reserva de OUTRO canal: 409, como sempre (decide o índice único)", async () => {
    const t1 = await criarMesa(banco, "T1", 4);
    await banco.sql("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, origem_reserva, status) values ($1,$2,'[TESTE]','34999998888',2,'whatsapp_agent','confirmada')", [edicao, t1]);
    const r = await post({ mesa_id: t1 });
    expect(r.status).toBe(409);
    expect((await banco.sql("select 1 from reservas")).length).toBe(1);
  });

  it("mesa inexistente ou inativa: 404 (igual a antes)", async () => {
    const t1 = await criarMesa(banco, "T1", 4);
    await criarMesa(banco, "T2", 4);
    await banco.sql("update mesas set ativa = false where id = $1", [t1]);
    expect((await post({ mesa_id: t1 })).status).toBe(404);
    expect((await post({ mesa_id: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
  });
});

describe("SEM a migração (estado da produção hoje): o site segue exatamente como antes", () => {
  let edicao: string;
  beforeEach(async () => {
    definirBanco(bancoAntigo);
    _reiniciarCacheDeCanais();
    await bancoAntigo.limpar();
    edicao = await criarEdicao(bancoAntigo);
  });

  it("estoque sem a tabela de canais: canaisConfigurados = false, site e painel veem tudo, WhatsApp nada", async () => {
    await criarMesa(bancoAntigo, "T1"); await criarMesa(bancoAntigo, "T2");
    expect((await estoqueDaEdicao(edicao)).canaisConfigurados).toBe(false);
    expect(numeros(await mesasLivres(edicao, "site"))).toEqual(["T1", "T2"]);
    expect(numeros(await mesasLivres(edicao, "admin"))).toEqual(["T1", "T2"]);
    expect(await mesasLivres(edicao, "whatsapp")).toEqual([]);
  });

  it("mapa do site idêntico ao de sempre", async () => {
    const t1 = await criarMesa(bancoAntigo, "T1", 4);
    await criarMesa(bancoAntigo, "T2", 6);
    await criarPedidoAguardando(bancoAntigo, { edicaoId: edicao, mesaId: t1 });
    const m = await mapaDaEdicao(edicao);
    expect(m.mesas.map((x) => x.numero)).toEqual(["T1", "T2"]);
    expect(m.ocupadas).toEqual([t1]);
  });

  it("POST /api/reservas: sem a migração nenhuma edição está liberada para o site — recusa (409) e NÃO cria reserva", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "chave-ficticia");
    vi.stubEnv("WHATSAPP_NUMERO_CASA", "5534991167064");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1352142871312651");
    vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio");
    vi.stubEnv("WHATSAPP_APP_SECRET", "segredo-ficticio");
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    vi.stubEnv("WHATSAPP_SEND_ENABLED", "true"); vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true"); // sem o envio ligado o site não libera reservas
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
    const t1 = await criarMesa(bancoAntigo, "T1", 4);
    const r = await POST(new Request("http://localhost/api/reservas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nome: "Ana Teste", whatsapp: "(34) 99999-8888", pessoas: 2, edicao_id: edicao, mesa_id: t1, turnstile: "ok" }) }));
    expect(r.status).toBe(409);
    expect((await bancoAntigo.sql("select 1 from reservas")).length).toBe(0);
  });
});
