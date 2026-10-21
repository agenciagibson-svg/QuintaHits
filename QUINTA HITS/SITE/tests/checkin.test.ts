import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { criarEdicao, criarMesa } from "./helpers/cenarios";

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});
const sessao = vi.hoisted(() => ({ casas: ["quinta-hits", "harley-grill"] as string[] }));
vi.mock("@/lib/casaSessao", () => ({ exigirSessaoCasa: async () => null, atorDaCasa: async () => "porta@teste.com", casasDaSessao: async () => sessao.casas }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "www.quintahits.com.br", "x-forwarded-proto": "https" }) }));

import { lerReferencia, marcarNaoComparecimentos, noitesEmAndamento, registrarChegada, _reiniciarPassadaNaoComparecimento } from "@/lib/checkin";
import { POST as checkinCasa } from "@/app/api/casa/checkin/route";
import MinhaReserva, { generateMetadata as metadadosDaReserva } from "@/app/minha-reserva/[id]/page";
import ReservaCurta from "@/app/r/[curto]/page";
import { _reiniciarLimites } from "@/lib/limiteTaxa";
import { linkWhatsappCliente } from "@/lib/mensagemCliente";

let banco: BancoTeste;
beforeAll(async () => { banco = await criarBancoTeste(); });
afterAll(async () => { definirBanco(null); await banco.pg.close(); });

const NOITE = "2099-01-07";
const HG = "harley-grill";
const ED_HG = `${NOITE}_${HG}`;
const AS_20H = new Date("2099-01-07T23:00:00Z"); // 20h em Uberlândia
const QH_HG = ["quinta-hits", HG] as const;

async function reserva(o: { edicao?: string; mesa: string; status?: string; codigo?: string; whatsapp?: string; nome?: string; chegou?: boolean; origem?: string }) {
  const [r] = await banco.sql<{ id: string }>(
    `insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, status, codigo, chegou_em, origem_reserva)
     values ($1, $2, $3, $4, 2, $5, $6, $7, $8) returning id`,
    [o.edicao ?? NOITE, o.mesa, o.nome ?? "Ana Teste", o.whatsapp ?? "34999998888", o.status ?? "confirmada", o.codigo ?? null, o.chegou ? "2099-01-07T22:50:00Z" : null, o.origem ?? "site"],
  );
  return r.id;
}
const linha = async (id: string) =>
  (await banco.sql<{ status: string; chegou_em: Date | null; checkin_por: string | null }>("select status, chegou_em, checkin_por from reservas where id = $1", [id]))[0];

describe("leitura do QR / código (puro)", () => {
  it("entende o link do QR, o código com ou sem prefixo e recusa o resto", () => {
    expect(lerReferencia("https://www.quintahits.com.br/casa/checkin/0b9c3c1e-4f2a-4d4e-9c1a-2b3c4d5e6f70")).toEqual({ id: "0b9c3c1e-4f2a-4d4e-9c1a-2b3c4d5e6f70" });
    expect(lerReferencia("hg-482193")).toEqual({ codigo: "482193", prefixo: "HG" });
    expect(lerReferencia(" QH 482193 ")).toEqual({ codigo: "482193", prefixo: "QH" });
    expect(lerReferencia("482193")).toEqual({ codigo: "482193", prefixo: null });
    for (const ruim of ["", "12345", "abc", "https://evil.com", null, 42]) expect(lerReferencia(ruim), String(ruim)).toBeNull();
  });

  it("mensagem de confirmação leva o link do QR numa linha só dele (a prévia do WhatsApp mostra o QR)", () => {
    const url = linkWhatsappCliente({ id: "0b9c3c1e-4f2a-4d4e-9c1a-2b3c4d5e6f70", nome: "Junior Silva", whatsapp: "34999998888", pessoas: 4, status: "confirmada", codigo: "HG-957192" }, { data: "2026-11-06", horario: "20h", casa: "harley-grill" }, "33");
    const texto = decodeURIComponent(url.split("text=")[1]);
    expect(texto).toMatch(/Código HG-957192\. Te esperamos!\n\nhttps?:\/\/[^\s]+\/r\/0b9c3c1e4f2a$/);
  });

  it("de madrugada a noite de ontem continua em andamento", () => {
    expect(noitesEmAndamento(AS_20H)).toEqual([NOITE]);
    expect(noitesEmAndamento(new Date("2099-01-08T04:30:00Z"))).toEqual([NOITE, "2099-01-08"]); // 01h30
    expect(noitesEmAndamento(new Date("2099-01-08T12:00:00Z"))).toEqual(["2099-01-08"]); // 9h
  });
});

describe("check-in na porta", () => {
  let mesaQh: string;
  let mesaHg: string;
  beforeEach(async () => {
    definirBanco(banco);
    _reiniciarLimites();
    _reiniciarPassadaNaoComparecimento();
    await banco.limpar();
    await criarEdicao(banco, { id: NOITE });
    await banco.sql("insert into edicoes (id, data, casa, artista, local, status) values ($1, $2, 'harley-grill', 'Voo Livre', 'Harley Grill', 'confirmada')", [ED_HG, NOITE]);
    mesaQh = await criarMesa(banco, "5");
    [{ id: mesaHg }] = await banco.sql<{ id: string }>("insert into mesas (casa, numero, lugares, area) values ('harley-grill', '12', 4, 'Pista VIP') returning id");
    sessao.casas = [...QH_HG];
  });

  it("pelo QR (id): registra a chegada, lê de novo = já tinha entrado; desfazer tira", async () => {
    const id = await reserva({ mesa: mesaQh, codigo: "QH-111111" });
    const r = await registrarChegada(`https://x/casa/checkin/${id}`, "porta@teste.com", { casas: QH_HG, agora: AS_20H });
    expect(r).toMatchObject({ ok: true, jaTinhaChegado: false, reserva: { mesa: "5", nome: "Ana Teste", casaNome: "QUINTA HITS" } });
    expect(await linha(id)).toMatchObject({ status: "confirmada", checkin_por: "porta@teste.com" });
    expect((await linha(id)).chegou_em).not.toBeNull();
    expect(await registrarChegada(id, "porta@teste.com", { casas: QH_HG, agora: AS_20H })).toMatchObject({ ok: true, jaTinhaChegado: true });
    expect((await registrarChegada(id, "porta@teste.com", { casas: QH_HG, acao: "desfazer", agora: AS_20H })).ok).toBe(true);
    expect((await linha(id)).chegou_em).toBeNull();
  });

  it("pelo código: com e sem prefixo; só nas casas de quem está no app", async () => {
    const id = await reserva({ edicao: ED_HG, mesa: mesaHg, codigo: "HG-482193" });
    expect((await registrarChegada("482193", "x", { casas: ["quinta-hits"], agora: AS_20H })).ok).toBe(false); // dono do Florindos não vê o Harley
    const r = await registrarChegada("hg482193", "x", { casas: QH_HG, agora: AS_20H });
    expect(r).toMatchObject({ ok: true, reserva: { id, mesa: "12", casaNome: "Harley Grill" } });
  });

  it("recusa: noite que não é hoje, reserva cancelada, mesa travada e código desconhecido", async () => {
    const futura = await criarEdicao(banco, { id: "2099-01-14" });
    const idFut = await reserva({ edicao: futura, mesa: mesaQh });
    expect(await registrarChegada(idFut, "x", { casas: QH_HG, agora: AS_20H })).toMatchObject({ ok: false, status: 409 });
    const idCanc = await reserva({ mesa: mesaQh, status: "cancelada" });
    expect(await registrarChegada(idCanc, "x", { casas: QH_HG, agora: AS_20H })).toMatchObject({ ok: false, erro: "Essa reserva foi cancelada." });
    const travada = await reserva({ edicao: ED_HG, mesa: mesaHg, whatsapp: "", nome: "Mesa travada", origem: "admin" });
    expect(await registrarChegada(travada, "x", { casas: QH_HG, agora: AS_20H })).toMatchObject({ ok: false, status: 409 });
    expect(await registrarChegada("999999", "x", { casas: QH_HG, agora: AS_20H })).toMatchObject({ ok: false, status: 404 });
    expect(await registrarChegada("lixo", "x", { casas: QH_HG, agora: AS_20H })).toMatchObject({ ok: false, status: 400 });
  });

  it("noite passada: o app não mexe; o painel (qualquerNoite) corrige", async () => {
    const id = await reserva({ mesa: mesaQh });
    const dias = new Date("2099-01-09T15:00:00Z");
    expect((await registrarChegada(id, "x", { casas: QH_HG, agora: dias })).ok).toBe(false);
    expect((await registrarChegada(id, "x", { casas: QH_HG, agora: dias, qualquerNoite: true })).ok).toBe(true);
  });

  it("pedido ainda aguardando: a chegada confirma a mesa", async () => {
    const id = await reserva({ mesa: mesaQh, status: "aguardando", codigo: "QH-222222" });
    expect((await registrarChegada(id, "x", { casas: QH_HG, agora: AS_20H })).ok).toBe(true);
    expect((await linha(id)).status).toBe("confirmada");
  });

  it("não compareceu: só numa noite com check-in, depois de abertura + tolerância; travada e quem chegou ficam", async () => {
    await banco.sql("insert into edicoes_regras (edicao_id, abertura, tolerancia_min) values ($1, '19h', 30), ($2, '19h', 30)", [NOITE, ED_HG]);
    const veio = await reserva({ mesa: mesaQh, chegou: true });
    const mesa6 = await criarMesa(banco, "6");
    const faltou = await reserva({ mesa: mesa6, whatsapp: "34911112222" });
    const travada = await reserva({ mesa: await criarMesa(banco, "7"), whatsapp: "", nome: "Mesa travada", origem: "admin" });
    // Harley: ninguém fez check-in nesta noite → nada muda (a casa não está usando o QR).
    const hgSemCheckin = await reserva({ edicao: ED_HG, mesa: mesaHg });

    expect(await marcarNaoComparecimentos(new Date("2099-01-07T22:20:00Z"))).toBe(0); // 19h20: dentro da tolerância
    _reiniciarPassadaNaoComparecimento();
    expect(await marcarNaoComparecimentos(new Date("2099-01-07T22:31:00Z"))).toBe(1); // 19h31
    expect((await linha(faltou)).status).toBe("nao_compareceu");
    expect((await linha(veio)).status).toBe("confirmada");
    expect((await linha(travada)).status).toBe("confirmada");
    expect((await linha(hgSemCheckin)).status).toBe("confirmada");

    // Chegou atrasado: a porta registra e a reserva volta (mesa ainda livre).
    expect((await registrarChegada(faltou, "x", { casas: QH_HG, agora: AS_20H })).ok).toBe(true);
    expect((await linha(faltou)).status).toBe("confirmada");
  });

  it("não compareceu e a mesa já foi dada a outra pessoa: avisa em vez de duplicar", async () => {
    const id = await reserva({ mesa: mesaQh, status: "nao_compareceu" });
    await reserva({ mesa: mesaQh, whatsapp: "34933334444", nome: "Outra" });
    expect(await registrarChegada(id, "x", { casas: QH_HG, agora: AS_20H })).toMatchObject({ ok: false, status: 409 });
  });

  it("API do app: usa as casas da sessão", async () => {
    vi.useFakeTimers({ now: AS_20H, toFake: ["Date"] });
    try {
      const id = await reserva({ edicao: ED_HG, mesa: mesaHg, codigo: "HG-555555" });
      const chamar = (corpo: unknown) => checkinCasa(new Request("http://x/api/casa/checkin", { method: "POST", body: JSON.stringify(corpo) }));
      sessao.casas = ["quinta-hits"];
      expect((await chamar({ ref: id })).status).toBe(404);
      sessao.casas = [...QH_HG];
      const r = await chamar({ ref: id });
      expect(r.status).toBe(200);
      expect((await r.json()).reserva).toMatchObject({ mesa: "12", nome: "Ana Teste" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("página do cliente: QR que leva ao check-in; mesa travada não tem página", async () => {
    vi.useFakeTimers({ now: AS_20H, toFake: ["Date"] });
    try {
      const id = await reserva({ mesa: mesaQh, codigo: "QH-777777", nome: "Bruna Silva" });
      const html = renderToStaticMarkup(await MinhaReserva({ params: Promise.resolve({ id }) }));
      expect(html).toContain("<svg");
      expect(html).toContain("QH-777777");
      expect(html).toContain("Bruna ·"); // só o primeiro nome
      expect(html).not.toContain("Silva");
      // Link curto da mensagem (/r/<12 caracteres>): a mesma página; começo que não existe = sem página.
      const curta = renderToStaticMarkup(await ReservaCurta({ params: Promise.resolve({ curto: id.replace(/-/g, "").slice(0, 12) }) }));
      expect(curta).toContain("QH-777777");
      await expect(ReservaCurta({ params: Promise.resolve({ curto: "000000000000" }) })).rejects.toThrow();
      await expect(ReservaCurta({ params: Promise.resolve({ curto: "123" }) })).rejects.toThrow();
      // Prévia do link no WhatsApp: título com mesa, noite e casa (a imagem é o QR, opengraph-image.tsx).
      const meta = await metadadosDaReserva({ params: Promise.resolve({ id }) });
      expect(meta.openGraph?.title).toBe("Reserva confirmada · Mesa 5 · 07/01 · QUINTA HITS");
      expect(String(meta.description)).toContain("QR de entrada");
      const travada = await reserva({ mesa: await criarMesa(banco, "8"), whatsapp: "", nome: "Mesa travada", origem: "admin" });
      await expect(MinhaReserva({ params: Promise.resolve({ id: travada }) })).rejects.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});
