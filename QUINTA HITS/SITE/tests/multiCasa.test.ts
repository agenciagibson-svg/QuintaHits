import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { criarEdicao, criarMesa, criarPedidoAguardando, liberarEdicaoParaSite, statusDaReserva } from "./helpers/cenarios";
import {
  CASAS,
  casaDaEdicaoId,
  casaDoDominio,
  casaDoParametro,
  dataDaEdicaoId,
  edicaoIdDe,
  edicaoIdValido,
  ehPaginaDeOutraCasa,
  lerEdicaoId,
} from "@/config/casas";

const sessao = vi.hoisted(() => ({ autenticado: true }));

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});
vi.mock("@/lib/adminSessao", () => ({
  exigirSessao: async () => (sessao.autenticado ? null : NextResponse.json({ erro: "Não autenticado." }, { status: 401 })),
  atorDaSessao: async () => "equipe@teste.com",
  auditarPainel: async () => undefined,
}));
vi.mock("@/lib/casaSessao", () => ({ exigirSessaoCasa: async () => null, atorDaCasa: async () => "dono@florindos.com" }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/pushCasa", () => ({ notificarCasa: vi.fn(async () => ({ enviados: 0, removidos: 0 })) }));

import { POST as reservar } from "@/app/api/reservas/route";
import { GET as mapa } from "@/app/api/reservas/mapa/route";
import { GET as listarEdicoes, POST as criarEdicaoApi } from "@/app/api/admin/edicoes/route";
import { GET as listarMesas, POST as criarMesaApi } from "@/app/api/admin/mesas/route";
import { GET as lerPlanta, PUT as gravarPlanta } from "@/app/api/admin/planta/route";
import { GET as regrasDaEdicao } from "@/app/api/admin/edicoes/[id]/regras/route";
import { GET as reservasDaEdicao } from "@/app/api/admin/reservas/route";
import { GET as appCasaListar } from "@/app/api/casa/reservas/route";
import { PUT as appCasaMudar } from "@/app/api/casa/reservas/[id]/route";
import { middleware } from "@/middleware";
import { notificarCasa } from "@/lib/pushCasa";
import { _reiniciarCacheDeCanais } from "@/lib/disponibilidade";
import { _reiniciarLimites } from "@/lib/limiteTaxa";
import { edicoesProntasParaAgente, situacaoDoSite } from "@/lib/regras";
import { todasEdicoes } from "@/lib/programacao";
import { linkWhatsappCliente } from "@/lib/mensagemCliente";

let banco: BancoTeste;
beforeAll(async () => { banco = await criarBancoTeste(); });
afterAll(async () => { definirBanco(null); await banco.pg.close(); });

const HG = "harley-grill";
const DATA = "2099-01-07"; // quinta
const ED_HG = `${DATA}_${HG}`;

async function criarEdicaoHarley(data = DATA): Promise<string> {
  const id = `${data}_${HG}`;
  await banco.sql("insert into edicoes (id, data, casa, artista, local, status) values ($1, $2, $3, '[TESTE] Atração', 'Harley Grill', 'confirmada')", [id, data, HG]);
  return id;
}
async function criarMesaHarley(numero: string, lugares = 4): Promise<string> {
  const [m] = await banco.sql<{ id: string }>("insert into mesas (casa, numero, lugares, area) values ($1, $2, $3, 'Pista VIP') returning id", [HG, numero, lugares]);
  return m.id;
}

describe("ids, domínios e páginas por casa (puro)", () => {
  it("Quinta Hits mantém o id = data; outras casas ganham o sufixo e a data continua no começo", () => {
    expect(edicaoIdDe("quinta-hits", DATA)).toBe(DATA);
    expect(edicaoIdDe(HG, DATA)).toBe(ED_HG);
    expect(lerEdicaoId(ED_HG)).toEqual({ casa: HG, data: DATA });
    expect(lerEdicaoId(DATA)).toEqual({ casa: "quinta-hits", data: DATA });
    expect(casaDaEdicaoId(ED_HG)).toBe(HG);
    expect(dataDaEdicaoId(ED_HG)).toBe(DATA);
    // Comparar com uma data segue certo: de hoje em diante, já passou.
    expect(ED_HG >= DATA).toBe(true);
    expect(ED_HG < "2099-01-08").toBe(true);
  });

  it("recusa id fora do formato, casa desconhecida e o sufixo da própria Quinta Hits", () => {
    for (const ruim of ["", "2099-1-7", "2099-02-30", `${DATA}_`, `${DATA}_xpto`, `${DATA}_quinta-hits`, `${DATA}-${HG}`, `${DATA}_${HG}x`, null, 5]) {
      expect(edicaoIdValido(ruim), String(ruim)).toBe(false);
    }
    expect(edicaoIdValido(DATA)).toBe(true);
    expect(edicaoIdValido(ED_HG)).toBe(true);
  });

  it("casa por parâmetro: ausente = Quinta Hits; desconhecida = null", () => {
    expect(casaDoParametro(null)).toBe("quinta-hits");
    expect(casaDoParametro("")).toBe("quinta-hits");
    expect(casaDoParametro(HG)).toBe(HG);
    expect(casaDoParametro("outra")).toBeNull();
  });

  it("domínio próprio: só o que está na lista, sem diferenciar maiúscula e ignorando a porta", () => {
    const cfg = " Reservas.HarleyGrill.com.br = harley-grill , www.harleygrill.com.br=harley-grill,x.com=desconhecida";
    expect(casaDoDominio("reservas.harleygrill.com.br", cfg)).toBe(HG);
    expect(casaDoDominio("WWW.HARLEYGRILL.COM.BR:443", cfg)).toBe(HG);
    expect(casaDoDominio("www.quintahits.com.br", cfg)).toBeNull();
    expect(casaDoDominio("x.com", cfg)).toBeNull();
    expect(casaDoDominio("reservas.harleygrill.com.br", undefined)).toBeNull();
  });

  it("páginas de outra casa ficam fora do cabeçalho/rodapé da Quinta Hits", () => {
    expect(ehPaginaDeOutraCasa("/harley-grill")).toBe(true);
    expect(ehPaginaDeOutraCasa("/harley-grill/x")).toBe(true);
    expect(ehPaginaDeOutraCasa("/harley-grillx")).toBe(false);
    expect(ehPaginaDeOutraCasa("/reservar")).toBe(false);
    expect(ehPaginaDeOutraCasa(null)).toBe(false);
  });

  it("mensagem pronta do WhatsApp fala da casa certa", () => {
    const r = { nome: "Ana Teste", whatsapp: "34999998888", pessoas: 2, status: "confirmada" as const, codigo: "HG-123456" };
    const hg = decodeURIComponent(linkWhatsappCliente(r, { data: DATA, horario: "20h", local: "Harley Grill", casa: HG }, "12"));
    expect(hg).toContain("Sua reserva no Harley Grill está confirmada: mesa 12 para 2 pessoa(s), dia 07/01, a partir das 20h. Código HG-123456.");
    expect(hg).not.toMatch(/QUINTA HITS|quinta 07/);
    const qh = decodeURIComponent(linkWhatsappCliente({ ...r, codigo: "QH-1" }, { data: DATA, horario: "20h", local: "Florindos Bar" }, "12"));
    expect(qh).toContain("Sua reserva na QUINTA HITS está confirmada: mesa 12 para 2 pessoa(s), quinta 07/01, a partir das 20h no Florindos Bar.");
  });

  it("as mesas do seed do Harley: 93, todas de 4 lugares, números únicos e dentro do mapa", () => {
    const sql = readFileSync(new URL("../supabase/seed-2026-10-20-harley-grill-mesas.sql", import.meta.url), "utf8");
    const linhas = [...sql.matchAll(/\('harley-grill', '(\d+)', (\d+), '([^']*)', ([\d.]+), ([\d.]+)\)/g)];
    expect(linhas).toHaveLength(93);
    expect(new Set(linhas.map((l) => l[1])).size).toBe(93);
    for (const [, , lugares, , x, y] of linhas) {
      expect(Number(lugares)).toBe(4);
      expect(Number(x)).toBeGreaterThan(0);
      expect(Number(x)).toBeLessThan(100);
      expect(Number(y)).toBeGreaterThan(0);
      expect(Number(y)).toBeLessThan(100);
    }
    expect(linhas.filter((l) => l[3] === "Pista VIP")).toHaveLength(13);
    expect(CASAS[HG].mapa.fundo).toBe("/casas/harley-grill/planta.webp");
  });
});

describe("banco: mesas e edições separadas por casa", () => {
  beforeEach(async () => {
    definirBanco(banco);
    await banco.limpar();
  });

  it("o mesmo número de mesa pode existir em casas diferentes, mas não repetido na mesma casa", async () => {
    await criarMesa(banco, "7");
    await criarMesaHarley("7");
    await expect(criarMesaHarley("7")).rejects.toThrow();
  });

  it("o seed do Harley entra inteiro, roda de novo sem duplicar e não mexe nas mesas da Quinta Hits", async () => {
    await criarMesa(banco, "1");
    const seed = readFileSync(new URL("../supabase/seed-2026-10-20-harley-grill-mesas.sql", import.meta.url), "utf8");
    await banco.pg.exec(seed);
    await banco.pg.exec(seed);
    const porCasa = await banco.sql<{ casa: string; n: number }>("select casa, count(*)::int as n from mesas group by casa order by casa");
    expect(porCasa).toEqual([{ casa: HG, n: 93 }, { casa: "quinta-hits", n: 1 }]);
  });

  it("o id da edição segue o formato da casa (o banco recusa o resto)", async () => {
    await expect(banco.sql("insert into edicoes (id, data, casa) values ($1, $2, $3)", [DATA, DATA, HG])).rejects.toThrow();
    await expect(banco.sql("insert into edicoes (id, data, casa) values ($1, $2, 'quinta-hits')", [ED_HG, DATA])).rejects.toThrow();
    await expect(banco.sql("insert into edicoes (id, data, casa) values ($1, $2, 'casa-que-nao-existe')", [`${DATA}_casa-que-nao-existe`, DATA])).rejects.toThrow();
    await criarEdicaoHarley();
    await criarEdicao(banco, { id: DATA });
  });

  it("o banco recusa reserva e canal que juntam mesa de uma casa com edição de outra", async () => {
    const edQh = await criarEdicao(banco, { id: DATA });
    const mesaQh = await criarMesa(banco, "T1");
    const edHg = await criarEdicaoHarley();
    const mesaHg = await criarMesaHarley("1");
    await expect(criarPedidoAguardando(banco, { edicaoId: edHg, mesaId: mesaQh })).rejects.toThrow(/casas diferentes/);
    await expect(criarPedidoAguardando(banco, { edicaoId: edQh, mesaId: mesaHg, codigo: "QH-000002" })).rejects.toThrow(/casas diferentes/);
    await expect(banco.sql("insert into edicoes_mesas (edicao_id, mesa_id) values ($1, $2)", [edHg, mesaQh])).rejects.toThrow(/casas diferentes/);
    // Mesma casa: entra normalmente.
    await criarPedidoAguardando(banco, { edicaoId: edHg, mesaId: mesaHg, codigo: "HG-000001" });
    await criarPedidoAguardando(banco, { edicaoId: edQh, mesaId: mesaQh, codigo: "QH-000001" });
  });
});

describe("site e WhatsApp: nada do Harley vaza para a Quinta Hits", () => {
  beforeEach(async () => {
    definirBanco(banco);
    _reiniciarCacheDeCanais();
    await banco.limpar();
  });

  it("programação pública, situação do /reservar e agente do WhatsApp só enxergam a Quinta Hits", async () => {
    const edQh = await criarEdicao(banco, { id: DATA });
    await criarMesa(banco, "T1");
    await liberarEdicaoParaSite(banco, edQh);
    await banco.sql("update edicoes_regras set atendimento_automatico = true where edicao_id = $1", [edQh]);
    const mesaQh = (await banco.sql<{ id: string }>("select id from mesas where numero = 'T1'"))[0].id;
    await banco.sql("insert into edicoes_mesas (edicao_id, mesa_id, disponivel_site, disponivel_whatsapp, disponivel_admin) values ($1, $2, true, true, true)", [edQh, mesaQh]);

    const edHg = await criarEdicaoHarley();
    await criarMesaHarley("1");
    await liberarEdicaoParaSite(banco, edHg);
    await banco.sql("update edicoes_regras set atendimento_automatico = true where edicao_id = $1", [edHg]);

    const agora = new Date("2098-12-30T15:00:00Z");
    expect((await todasEdicoes()).map((e) => e.id)).toEqual([edQh]);
    expect((await situacaoDoSite(agora)).prontas.map((p) => p.edicao.id)).toEqual([edQh]);
    expect((await situacaoDoSite(agora, 6, HG)).prontas.map((p) => p.edicao.id)).toEqual([edHg]);
    expect((await edicoesProntasParaAgente(agora)).map((p) => p.edicao.id)).toEqual([edQh]);
  });
});

describe("reserva pelo site do Harley Grill (tudo simulado)", () => {
  let mesaHg: string;
  let mesaQh: string;
  const corpo = (o: Record<string, unknown> = {}) => ({ nome: "Ana Teste", whatsapp: "(34) 99999-8888", pessoas: 2, edicao_id: ED_HG, mesa_id: mesaHg, turnstile: "ok", politica: true, ...o });
  const post = (c: Record<string, unknown>, ip = "10.0.0.1") =>
    reservar(new Request("http://localhost/api/reservas", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(c) }));

  beforeEach(async () => {
    definirBanco(banco);
    _reiniciarCacheDeCanais();
    _reiniciarLimites();
    await banco.limpar();
    await criarEdicao(banco, { id: DATA });
    mesaQh = await criarMesa(banco, "T1");
    await criarEdicaoHarley();
    mesaHg = await criarMesaHarley("12");
    await liberarEdicaoParaSite(banco, ED_HG);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "chave-ficticia");
    vi.mocked(notificarCasa).mockClear();
  });

  it("com a chave do site ligada, abre SEM WhatsApp e SEM RESERVAS_SITE_MANUAL: pedido para a equipe, código HG", async () => {
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    vi.stubEnv("RESERVAS_SITE_MANUAL", "");
    const m = await mapa(new Request(`http://localhost/api/reservas/mapa?edicao=${ED_HG}`));
    expect(m.status).toBe(200);
    const jm = await m.json();
    expect(jm.mesas.map((x: { numero: string }) => x.numero)).toEqual(["12"]); // nenhuma mesa da Quinta Hits
    const r = await post(corpo());
    expect(r.status).toBe(201);
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, manual: true, mesa: "12" });
    expect(j.codigo).toMatch(/^HG-\d{6}$/);
    const [linha] = await banco.sql<{ status: string; expira_em: Date }>("select status, expira_em from reservas");
    expect(linha.status).toBe("aguardando");
    expect(new Date(linha.expira_em).toISOString()).toBe("2099-01-08T02:59:00.000Z"); // fim do dia da edição, Uberlândia
    // O app do dono do Florindos não é avisado de pedido do Harley.
    expect(notificarCasa).not.toHaveBeenCalled();
  });

  it("chave do site desligada: fechado também para o Harley", async () => {
    vi.stubEnv("RESERVAS_SITE_ENABLED", "");
    expect((await post(corpo())).status).toBe(503);
    expect((await mapa(new Request(`http://localhost/api/reservas/mapa?edicao=${ED_HG}`))).status).toBe(503);
  });

  it("mesa da Quinta Hits numa edição do Harley: recusada como indisponível", async () => {
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    expect((await post(corpo({ mesa_id: mesaQh }))).status).toBe(404);
    expect((await banco.sql("select 1 from reservas")).length).toBe(0);
  });

  it("app da casa (Florindos): não lista nem altera pedido do Harley", async () => {
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    const { id } = await (await post(corpo())).json();
    const lista = await (await appCasaListar()).json();
    expect(lista.edicoes.map((e: { id: string }) => e.id)).toEqual([DATA]);
    expect(lista.reservas).toEqual([]);
    expect(lista.mesas.map((m: { numero: string }) => m.numero)).toEqual(["T1"]);
    const mudar = await appCasaMudar(new Request("http://x", { method: "PUT", body: JSON.stringify({ status: "confirmada" }) }), { params: Promise.resolve({ id }) });
    expect(mudar.status).toBe(404);
    expect(await statusDaReserva(banco, id)).toBe("aguardando");
  });
});

describe("painel por casa", () => {
  beforeEach(async () => {
    sessao.autenticado = true;
    definirBanco(banco);
    _reiniciarCacheDeCanais();
    await banco.limpar();
  });

  const json = (url: string, corpo?: unknown, metodo = "POST") =>
    new Request(url, corpo === undefined ? undefined : { method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });

  it("edições: cada casa lista as suas; o Harley aceita qualquer dia e nasce com o local da casa", async () => {
    await criarEdicao(banco, { id: DATA });
    const sabado = "2099-01-09";
    const r = await criarEdicaoApi(json("http://localhost/api/admin/edicoes", { data: sabado, casa: HG, local: "" }));
    expect(r.status).toBe(201);
    expect((await r.json()).edicao).toMatchObject({ id: `${sabado}_${HG}`, casa: HG, local: "Harley Grill" });
    // Quinta Hits continua exigindo quinta-feira.
    expect((await criarEdicaoApi(json("http://localhost/api/admin/edicoes", { data: sabado }))).status).toBe(400);
    expect((await criarEdicaoApi(json("http://localhost/api/admin/edicoes", { data: sabado, casa: "outra" }))).status).toBe(400);

    const qh = await (await listarEdicoes(new Request("http://localhost/api/admin/edicoes"))).json();
    const hg = await (await listarEdicoes(new Request(`http://localhost/api/admin/edicoes?casa=${HG}`))).json();
    expect(qh.edicoes.map((e: { id: string }) => e.id)).toEqual([DATA]);
    expect(hg.edicoes.map((e: { id: string }) => e.id)).toEqual([`${sabado}_${HG}`]);
  });

  it("mesas: criar no Harley com número já usado na Quinta Hits; listas separadas", async () => {
    await criarMesa(banco, "5");
    expect((await criarMesaApi(json("http://localhost/api/admin/mesas", { numero: "5", lugares: 4, casa: HG }))).status).toBe(201);
    expect((await criarMesaApi(json("http://localhost/api/admin/mesas", { numero: "5", lugares: 4, casa: HG }))).status).toBe(409);
    const qh = await (await listarMesas(new Request("http://localhost/api/admin/mesas"))).json();
    const hg = await (await listarMesas(new Request(`http://localhost/api/admin/mesas?casa=${HG}`))).json();
    expect(qh.mesas).toHaveLength(1);
    expect(hg.mesas).toHaveLength(1);
    expect((await listarMesas(new Request("http://localhost/api/admin/mesas?casa=outra"))).status).toBe(400);
  });

  it("planta: cada casa guarda a sua", async () => {
    const palco = { id: "palco-1", tipo: "palco", rotulo: "", x: 50, y: 8, w: 40, h: 12 };
    expect((await gravarPlanta(json(`http://localhost/api/admin/planta?casa=${HG}`, { elementos: [palco] }, "PUT"))).status).toBe(200);
    expect(await (await lerPlanta(new Request(`http://localhost/api/admin/planta?casa=${HG}`))).json()).toEqual({ migrado: true, elementos: [palco] });
    expect(await (await lerPlanta(new Request("http://localhost/api/admin/planta"))).json()).toEqual({ migrado: true, elementos: [] });
  });

  it("regras e pedidos aceitam o id da edição do Harley", async () => {
    await criarEdicaoHarley();
    await criarMesaHarley("1");
    const g = await regrasDaEdicao(new Request("http://x"), { params: Promise.resolve({ id: ED_HG }) });
    expect(g.status).toBe(200);
    const painel = await g.json();
    expect(painel.mesas.map((m: { numero: string }) => m.numero)).toEqual(["1"]);
    expect((await reservasDaEdicao(new Request(`http://localhost/api/admin/reservas?edicao=${ED_HG}`))).status).toBe(200);
    expect((await regrasDaEdicao(new Request("http://x"), { params: Promise.resolve({ id: `${DATA}_outra` }) })).status).toBe(400);
  });
});

describe("middleware: domínio próprio do Harley", () => {
  const req = (url: string) => new NextRequest(url);
  beforeEach(() => {
    vi.stubEnv("DOMINIOS_CASAS", "reservas.harleygrill.com.br=harley-grill");
  });

  it("no domínio do Harley, a raiz, /reservar e /programacao levam à reserva do Harley", async () => {
    for (const caminho of ["/", "/reservar", "/programacao"]) {
      const r = await middleware(req(`https://reservas.harleygrill.com.br${caminho}?x=1`));
      expect(r.status, caminho).toBe(307);
      expect(r.headers.get("location")).toBe("https://reservas.harleygrill.com.br/harley-grill");
    }
  });

  it("no domínio da Quinta Hits nada muda: páginas públicas passam direto e o painel continua exigindo login", async () => {
    for (const caminho of ["/", "/reservar", "/programacao"]) {
      expect((await middleware(req(`https://www.quintahits.com.br${caminho}`))).headers.get("x-middleware-next"), caminho).toBe("1");
    }
    expect((await middleware(req("https://www.quintahits.com.br/api/admin/mesas"))).status).toBe(401);
    expect((await middleware(req("https://reservas.harleygrill.com.br/api/admin/mesas"))).status).toBe(401);
  });
});
