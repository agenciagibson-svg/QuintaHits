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
const appCasa = vi.hoisted(() => ({ casas: ["quinta-hits"] as string[] }));
vi.mock("@/lib/casaSessao", () => ({ exigirSessaoCasa: async () => null, atorDaCasa: async () => "dono@florindos.com", casasDaSessao: async () => appCasa.casas }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/pushCasa", () => ({ notificarCasa: vi.fn(async () => ({ enviados: 0, removidos: 0 })) }));

import { POST as reservar } from "@/app/api/reservas/route";
import { GET as mapa } from "@/app/api/reservas/mapa/route";
import { GET as listarEdicoes, POST as criarEdicaoApi } from "@/app/api/admin/edicoes/route";
import { GET as listarMesas, POST as criarMesaApi } from "@/app/api/admin/mesas/route";
import { GET as lerPlanta, PUT as gravarPlanta } from "@/app/api/admin/planta/route";
import { GET as regrasDaEdicao } from "@/app/api/admin/edicoes/[id]/regras/route";
import { GET as reservasDaEdicao, POST as ocuparPeloPainel } from "@/app/api/admin/reservas/route";
import { PUT as mudarPeloPainel } from "@/app/api/admin/reservas/[id]/route";
import { GET as appCasaListar } from "@/app/api/casa/reservas/route";
import { GET as lerDadosCasa, PUT as gravarDadosCasa } from "@/app/api/admin/casas/route";
import { dadosDaCasa, proximosEventosDaCasa } from "@/lib/casasDados";
import { ComoChegarCasa } from "@/components/OutraCasa";
import { renderToStaticMarkup } from "react-dom/server";
import { PUT as appCasaMudar } from "@/app/api/casa/reservas/[id]/route";
import { middleware } from "@/middleware";
import { notificarCasa } from "@/lib/pushCasa";
import { _reiniciarCacheDeCanais } from "@/lib/disponibilidade";
import { _reiniciarLimites } from "@/lib/limiteTaxa";
import { edicoesProntasParaAgente, situacaoDoSite } from "@/lib/regras";
import { todasEdicoes } from "@/lib/programacao";
import { linkWhatsappCliente } from "@/lib/mensagemCliente";
import { validarPlanta } from "@/lib/planta";

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
    expect(hg).not.toMatch(/QUINTA HITS/);
    const qh = decodeURIComponent(linkWhatsappCliente({ ...r, codigo: "QH-1" }, { data: DATA, horario: "20h", local: "Florindos Bar" }, "12"));
    expect(qh).toContain("Sua reserva na QUINTA HITS está confirmada: mesa 12 para 2 pessoa(s), dia 07/01, a partir das 20h no Florindos Bar.");
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
    // Mapa redesenhado: sem imagem de fundo, setores como elementos do salão (válidos e editáveis no painel).
    expect(CASAS[HG].mapa.fundo).toBeNull();
    const planta = JSON.parse(/set planta = '(.+)'::jsonb/.exec(sql)![1]);
    const validada = validarPlanta(planta.elementos);
    expect(validada).not.toHaveProperty("erro");
    expect((validada as { elementos: { tipo: string; rotulo: string }[] }).elementos.map((e) => e.rotulo)).toEqual(
      expect.arrayContaining(["Palco", "Entrada", "Kids", "Deck", "Telão", "Bar Drinks"]),
    );
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
    // O mapa do Harley entra uma vez; mudança feita depois no painel não é desfeita ao rodar o seed de novo.
    const [{ planta }] = await banco.sql<{ planta: { elementos: unknown[] } }>("select planta from casas where id = $1", [HG]);
    expect(planta.elementos).toHaveLength(20);
    expect((planta.elementos as { tipo: string }[]).filter((e) => e.tipo === "parede")).toHaveLength(10);
    await banco.sql("update casas set planta = '{\"elementos\": []}' where id = $1", [HG]);
    await banco.pg.exec(seed);
    expect((await banco.sql<{ planta: { elementos: unknown[] } }>("select planta from casas where id = $1", [HG]))[0].planta.elementos).toHaveLength(0);
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

  it("agenda pública traz as duas casas; /reservar e agente do WhatsApp só enxergam a Quinta Hits", async () => {
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
    // Agenda pública é única (todas as casas, em ordem de data); reserva pelo site e WhatsApp seguem separados por casa.
    expect((await todasEdicoes()).map((e) => e.id)).toEqual([edQh, edHg]);
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
    // Aviso só para quem atende o Harley (a equipe): o filtro por casa fica no notificarCasa.
    await new Promise((r) => setTimeout(r, 0));
    expect(notificarCasa).toHaveBeenCalledTimes(1);
    const [aviso, casaDoAviso] = vi.mocked(notificarCasa).mock.calls[0];
    expect(casaDoAviso).toBe(HG);
    expect(aviso.titulo).toBe("Novo pedido de mesa · Harley Grill");
    expect(aviso.url).toBe(`/casa?edicao=${ED_HG}`);
  });

  it("mesmo endereço com 3 pedidos abertos na noite: o 4º é recusado (outro endereço passa)", async () => {
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    const mesas = [mesaHg, await criarMesaHarley("13"), await criarMesaHarley("14"), await criarMesaHarley("15")];
    for (let i = 0; i < 3; i++) expect((await post(corpo({ mesa_id: mesas[i], whatsapp: `(34) 9999${i}-0000` }), "10.9.9.9")).status).toBe(201);
    const quarto = await post(corpo({ mesa_id: mesas[3], whatsapp: "(34) 99995-0000" }), "10.9.9.9");
    expect(quarto.status).toBe(429);
    expect((await post(corpo({ mesa_id: mesas[3], whatsapp: "(34) 99995-0000" }), "10.8.8.8")).status).toBe(201);
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
    appCasa.casas = ["quinta-hits"];
    const { id } = await (await post(corpo())).json();
    const lista = await (await appCasaListar()).json();
    expect(lista.edicoes.map((e: { id: string }) => e.id)).toEqual([DATA]);
    expect(lista.reservas).toEqual([]);
    expect(lista.mesas.map((m: { numero: string }) => m.numero)).toEqual(["T1"]);
    const mudar = await appCasaMudar(new Request("http://x", { method: "PUT", body: JSON.stringify({ status: "confirmada" }) }), { params: Promise.resolve({ id }) });
    expect(mudar.status).toBe(404);
    expect(await statusDaReserva(banco, id)).toBe("aguardando");
  });

  it("app da casa (equipe): lista as noites e os pedidos do Harley junto e aprova", async () => {
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    appCasa.casas = ["quinta-hits", HG];
    try {
      const { id } = await (await post(corpo())).json();
      const lista = await (await appCasaListar()).json();
      expect(lista.casas).toEqual([{ id: "quinta-hits", nome: "QUINTA HITS" }, { id: HG, nome: "Harley Grill" }]);
      expect(lista.edicoes.map((e: { id: string; casa: string }) => [e.id, e.casa])).toEqual([[DATA, "quinta-hits"], [ED_HG, HG]]);
      expect(lista.reservas.map((r: { id: string }) => r.id)).toEqual([id]);
      expect(lista.mesas.map((m: { numero: string }) => m.numero).sort()).toEqual(["12", "T1"]);
      const mudar = await appCasaMudar(new Request("http://x", { method: "PUT", body: JSON.stringify({ status: "confirmada" }) }), { params: Promise.resolve({ id }) });
      expect(mudar.status).toBe(200);
      expect(await statusDaReserva(banco, id)).toBe("confirmada");
    } finally {
      appCasa.casas = ["quinta-hits"];
    }
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
    // A Quinta Hits virou marca: também aceita qualquer dia da semana (id continua sendo a data).
    const qhSabado = await criarEdicaoApi(json("http://localhost/api/admin/edicoes", { data: sabado }));
    expect(qhSabado.status).toBe(201);
    expect((await qhSabado.json()).edicao).toMatchObject({ id: sabado, casa: "quinta-hits" });
    expect((await criarEdicaoApi(json("http://localhost/api/admin/edicoes", { data: sabado, casa: "outra" }))).status).toBe(400);

    const qh = await (await listarEdicoes(new Request("http://localhost/api/admin/edicoes"))).json();
    const hg = await (await listarEdicoes(new Request(`http://localhost/api/admin/edicoes?casa=${HG}`))).json();
    expect(qh.edicoes.map((e: { id: string }) => e.id)).toEqual([sabado, DATA]);
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

describe("Harley Grill no site da Quinta Hits (Onde e agenda separada)", () => {
  beforeEach(async () => {
    sessao.autenticado = true;
    definirBanco(banco);
    await banco.limpar();
  });
  const put = (corpo: unknown, casa = HG) =>
    gravarDadosCasa(new Request(`http://localhost/api/admin/casas?casa=${casa}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }));

  it("a migração grava o endereço do Harley uma vez e não desfaz mudança feita no painel", async () => {
    const mig = readFileSync(new URL("../supabase/migracao-2026-10-21-dados-das-casas.sql", import.meta.url), "utf8");
    await banco.pg.exec(mig);
    expect(await dadosDaCasa(HG)).toMatchObject({ endereco: "Av. Anselmo Alves dos Santos, 1096", bairro: "Santa Mônica", cidade: "Uberlândia/MG" });
    await banco.sql("update casas set endereco = 'Outro, 1' where id = $1", [HG]);
    await banco.pg.exec(mig);
    expect((await dadosDaCasa(HG)).endereco).toBe("Outro, 1");
  });

  it("painel grava e lê os dados da casa; Instagram sem @; Quinta Hits e texto grande recusados", async () => {
    const r = await put({ endereco: " Av. Teste, 10 ", quando: "Sábados, 20h", instagram: "@harleygrill" });
    expect(r.status).toBe(200);
    expect((await r.json()).dados).toMatchObject({ endereco: "Av. Teste, 10", quando: "Sábados, 20h", instagram: "harleygrill" });
    expect((await (await lerDadosCasa(new Request(`http://localhost/api/admin/casas?casa=${HG}`))).json()).dados.endereco).toBe("Av. Teste, 10");
    expect((await put({ endereco: "x" }, "quinta-hits")).status).toBe(400);
    expect((await put({ endereco: "x".repeat(121) })).status).toBe(400);
    sessao.autenticado = false;
    expect((await put({ endereco: "y" })).status).toBe(401);
  });

  it("agenda do Harley: só eventos dele, de hoje em diante e sem os cancelados", async () => {
    await criarEdicao(banco, { id: DATA });
    await criarEdicaoHarley(DATA);
    await criarEdicaoHarley("2099-01-09");
    await banco.sql("update edicoes set status = 'cancelada' where id = $1", ["2099-01-09_harley-grill"]);
    await criarEdicaoHarley("2000-01-01");
    expect((await proximosEventosDaCasa(HG, new Date("2098-12-30T15:00:00Z"))).map((e) => e.id)).toEqual([ED_HG]);
  });

  it("Como chegar: com endereço mostra o mapa e a reserva do Harley; sem endereço, 'Em breve' e sem mapa", () => {
    const com = renderToStaticMarkup(ComoChegarCasa({ casa: HG, dados: { endereco: "Av. Anselmo Alves dos Santos, 1096", bairro: "Santa Mônica", cidade: "Uberlândia/MG", quando: "", instagram: "" } }));
    expect(com).toContain("Av. Anselmo Alves dos Santos, 1096 — Santa Mônica");
    expect(com).toContain("google.com/maps");
    expect(com).toContain('href="/harley-grill"');
    expect(com).not.toContain("Quando");
    const sem = renderToStaticMarkup(ComoChegarCasa({ casa: HG, dados: { endereco: "", bairro: "", cidade: "", quando: "", instagram: "" } }));
    expect(sem).toContain("Em breve");
    expect(sem).not.toContain("google.com/maps");
  });
});

describe("Quinta Hits como marca: agenda só com as datas cadastradas, em qualquer dia", () => {
  beforeEach(async () => {
    definirBanco(banco);
    await banco.limpar();
  });

  it("sem placeholders: só o que foi cadastrado, de hoje em diante, sem canceladas; sábado entra normalmente", async () => {
    const { proximasEdicoes, proximaEdicao, temEdicaoHoje } = await import("@/lib/programacao");
    const agora = new Date("2099-01-05T15:00:00Z"); // segunda
    expect(await proximasEdicoes(agora, 4)).toEqual([]);
    expect(await proximaEdicao(agora)).toBeNull();
    await criarEdicao(banco, { id: "2099-01-10" }); // sábado
    await criarEdicao(banco, { id: "2099-01-07", status: "cancelada" }); // quinta cancelada
    expect((await proximasEdicoes(agora, 4)).map((e) => e.id)).toEqual(["2099-01-10"]);
    expect(await temEdicaoHoje(new Date("2099-01-10T22:00:00Z"))).toBe(true); // sábado com evento
    expect(await temEdicaoHoje(new Date("2099-01-07T22:00:00Z"))).toBe(false); // quinta cancelada
    expect(await temEdicaoHoje(new Date("2099-01-14T22:00:00Z"))).toBe(false); // quinta sem evento cadastrado
  });
});

describe("agenda única: card de noite em outra casa", () => {
  it("mostra a casa e o link de reserva dela; noite da Quinta Hits não ganha esses extras", async () => {
    const { default: EdicaoCard } = await import("@/components/EdicaoCard");
    const base = { data: "2099-01-09", artista: "Voo Livre", instagram: "", tema: "", genero: "" as const, horario: "20h", local: "Harley Grill", status: "confirmada" as const, destaque: "" };
    const hg = renderToStaticMarkup(EdicaoCard({ edicao: { ...base, id: "2099-01-09_harley-grill", casa: HG } }));
    expect(hg).toContain("Harley Grill");
    expect(hg).toContain('href="/harley-grill"');
    const qh = renderToStaticMarkup(EdicaoCard({ edicao: { ...base, id: "2099-01-09", casa: "quinta-hits", local: "Florindos Bar" } }));
    expect(qh).not.toContain("card__reservar");
    expect(qh).not.toContain("card__casa");
  });
});

describe("terceira casa: Solarium Beach Bar", () => {
  beforeEach(async () => {
    sessao.autenticado = true;
    definirBanco(banco);
    await banco.limpar();
  });

  it("id de edição e cadastro pelo painel funcionam como no Harley (ainda sem página de reserva)", async () => {
    expect(edicaoIdValido("2099-01-09_solarium")).toBe(true);
    expect(casaDaEdicaoId("2099-01-09_solarium")).toBe("solarium");
    expect(ehPaginaDeOutraCasa("/solarium")).toBe(false); // sem página de reserva enquanto não tem mapa
    const r = await criarEdicaoApi(new Request("http://localhost/api/admin/edicoes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: "2099-01-09", casa: "solarium", artista: "[TESTE]" }) }));
    expect(r.status).toBe(201);
    expect((await r.json()).edicao).toMatchObject({ id: "2099-01-09_solarium", casa: "solarium", local: "Solarium Beach Bar" });
    expect((await criarMesaApi(new Request("http://localhost/api/admin/mesas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ numero: "1", lugares: 4, casa: "solarium" }) }))).status).toBe(201);
    const qh = await (await listarMesas(new Request("http://localhost/api/admin/mesas"))).json();
    expect(qh.mesas).toHaveLength(0);
  });
});

describe("Solarium sem reserva pelo site (ainda sem mapa)", () => {
  it("site fechado para reserva, card sem link de reserva e 'Onde' com 'Ver agenda'", async () => {
    const { estadoDasReservasDoSite } = await import("@/lib/reservasSite");
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    expect(estadoDasReservasDoSite("solarium").aberto).toBe(false);
    expect(estadoDasReservasDoSite(HG).aberto).toBe(true);
    const { default: EdicaoCard } = await import("@/components/EdicaoCard");
    const card = renderToStaticMarkup(EdicaoCard({ edicao: { id: "2099-01-09_solarium", data: "2099-01-09", artista: "Voo Livre", instagram: "", tema: "", genero: "", horario: "", local: "Solarium Beach Bar", status: "confirmada", destaque: "", casa: "solarium" } }));
    expect(card).toContain("Solarium Beach Bar");
    expect(card).not.toContain("card__reservar");
    const onde = renderToStaticMarkup(ComoChegarCasa({ casa: "solarium", dados: { endereco: "Rodovia 452, km 9", bairro: "Represa de Miranda", cidade: "", quando: "", instagram: "" } }));
    expect(onde).toContain("Ver agenda");
    expect(onde).not.toContain("Reservar mesa");
  });

  it("a migração do Solarium cria a casa, o endereço e a data de 26/12 sem duplicar", async () => {
    definirBanco(banco);
    await banco.limpar();
    const mig = readFileSync(new URL("../supabase/migracao-2026-10-21-solarium.sql", import.meta.url), "utf8");
    await banco.pg.exec(mig);
    await banco.pg.exec(mig);
    expect((await dadosDaCasa("solarium")).bairro).toBe("Represa de Miranda");
    const eds = await banco.sql<{ id: string; artista: string }>("select id, artista from edicoes where casa = 'solarium'");
    expect(eds).toEqual([{ id: "2026-12-26_solarium", artista: "Voo Livre" }]);
  });
});

describe("painel: reservar para cliente e travar mesa pelo mapa (Harley)", () => {
  let mesaHg: string;
  let mesaQh: string;
  const ocupar = (c: Record<string, unknown>) =>
    ocuparPeloPainel(new Request("http://localhost/api/admin/reservas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) }));
  const site = (c: Record<string, unknown>) =>
    reservar(new Request("http://localhost/api/reservas", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.9" }, body: JSON.stringify({ nome: "Ana Teste", whatsapp: "(34) 99999-8888", pessoas: 2, edicao_id: ED_HG, turnstile: "ok", politica: true, ...c }) }));

  beforeEach(async () => {
    sessao.autenticado = true;
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
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
  });

  it("travar: segura a mesa (site recusa e mostra ocupada), não conta como cliente; destravar libera", async () => {
    const r = await ocupar({ edicao_id: ED_HG, mesa_id: mesaHg, travar: true, motivo: "Mesa do dono" });
    expect(r.status).toBe(201);
    const { id, codigo } = await r.json();
    expect(codigo).toBeNull();
    const [linha] = await banco.sql<{ status: string; whatsapp: string; origem_reserva: string; nome: string; observacoes: string }>("select status, whatsapp, origem_reserva, nome, observacoes from reservas where id = $1", [id]);
    expect(linha).toMatchObject({ status: "confirmada", whatsapp: "", origem_reserva: "admin", nome: "Mesa travada", observacoes: "Mesa do dono" });

    const m = await (await mapa(new Request(`http://localhost/api/reservas/mapa?edicao=${ED_HG}`))).json();
    expect(m.ocupadas).toContain(mesaHg);
    expect((await site({ mesa_id: mesaHg })).status).toBe(409);
    expect((await ocupar({ edicao_id: ED_HG, mesa_id: mesaHg, travar: true })).status).toBe(409); // já travada

    const lista = await (await reservasDaEdicao(new Request(`http://localhost/api/admin/reservas?edicao=${ED_HG}`))).json();
    expect(lista.reservas[0]).toMatchObject({ origem_reserva: "admin", whatsapp: "", observacoes: "Mesa do dono" });

    const d = await mudarPeloPainel(new Request("http://x", { method: "PUT", body: JSON.stringify({ status: "cancelada" }) }), { params: Promise.resolve({ id }) });
    expect(d.status).toBe(200);
    expect((await site({ mesa_id: mesaHg })).status).toBe(201);
  });

  it("reserva de cliente pelo painel: já confirmada, com código HG, sem depender da chave do site", async () => {
    vi.stubEnv("RESERVAS_SITE_ENABLED", "");
    const r = await ocupar({ edicao_id: ED_HG, mesa_id: mesaHg, nome: "Bruno", whatsapp: "(34) 98888-7777", pessoas: 3 });
    expect(r.status).toBe(201);
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, mesa: "12" });
    expect(j.codigo).toMatch(/^HG-\d{6}$/);
    expect(await statusDaReserva(banco, j.id)).toBe("confirmada");
    expect((await ocupar({ edicao_id: ED_HG, mesa_id: mesaHg, nome: "Carla", whatsapp: "34977776666", pessoas: 2 })).status).toBe(409);
  });

  it("recusa: mesa de outra casa, mais pessoas que lugares, dados faltando, noite passada e sem login", async () => {
    expect((await ocupar({ edicao_id: ED_HG, mesa_id: mesaQh, travar: true })).status).toBe(404);
    expect((await ocupar({ edicao_id: ED_HG, mesa_id: mesaHg, nome: "Bruno", whatsapp: "34988887777", pessoas: 9 })).status).toBe(400);
    expect((await ocupar({ edicao_id: ED_HG, mesa_id: mesaHg, nome: "B", whatsapp: "34988887777", pessoas: 2 })).status).toBe(400);
    expect((await ocupar({ edicao_id: ED_HG, mesa_id: mesaHg, nome: "Bruno", whatsapp: "123", pessoas: 2 })).status).toBe(400);
    expect((await ocupar({ edicao_id: "xx", mesa_id: mesaHg, travar: true })).status).toBe(400);
    const passada = await criarEdicaoHarley("2020-01-02");
    expect((await ocupar({ edicao_id: passada, mesa_id: mesaHg, travar: true })).status).toBe(409);
    sessao.autenticado = false;
    expect((await ocupar({ edicao_id: ED_HG, mesa_id: mesaHg, travar: true })).status).toBe(401);
    sessao.autenticado = true;
    expect((await banco.sql("select 1 from reservas")).length).toBe(0);
  });
});
