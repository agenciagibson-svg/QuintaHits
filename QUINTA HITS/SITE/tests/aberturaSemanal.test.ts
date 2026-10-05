import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { criarEdicao, criarMesa, liberarEdicaoParaSite } from "./helpers/cenarios";
import {
  aberturaSemanalDe, avaliarProntidaoDoSite, dataDeAbertura, descreverAbertura, inicioDasReservas, regrasCopiadas, REGRAS_VAZIAS, soAguardaAbertura, temRegras, type RegrasEdicao,
} from "@/lib/regrasEdicao";
import { validarAberturaSemanal } from "@/lib/adminValidacao";
import type { Edicao } from "@/lib/edicao";

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});
vi.mock("@/lib/adminSessao", () => ({
  exigirSessao: async () => null,
  atorDaSessao: async () => "equipe@teste.com",
  auditarPainel: async () => undefined,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { _reiniciarCacheDeCanais } from "@/lib/disponibilidade";
import { carregarPainelDeRegras, edicaoProntaParaSite, edicoesProntasParaSite, situacaoDoSite } from "@/lib/regras";
import { GET as lerConfig, PUT as gravarConfig } from "@/app/api/admin/config/route";

const SEGUNDA_12H = { dia: 1, hora: "12h" };
// Quinta 08/10/2026 → abre na segunda 05/10/2026 às 12h de Uberlândia = 15h UTC.
const ABRE = "2026-10-05T15:00:00.000Z";
const antes = new Date(Date.parse(ABRE) - 1000);
const depois = new Date(ABRE);

const edicao = (o: Partial<Edicao> = {}): Edicao => ({ id: "2026-10-08", data: "2026-10-08", artista: "X", instagram: "", tema: "", genero: "", horario: "20h", local: "Florindos Bar", status: "confirmada", destaque: "", ...o });
const completas = (o: Partial<RegrasEdicao> = {}): RegrasEdicao => ({
  ...REGRAS_VAZIAS, abertura: "19h", reservas_ate: "2026-10-08T18:00:00.000Z", tolerancia_min: 15, cancelamento_ate_horas: 24,
  capacidade_maxima: 120, consumacao_minima_centavos: 0, instrucoes_chegada: "Chegue cedo.", reservas_site: true, ...o,
});

describe("cálculo da abertura semanal (puro)", () => {
  it("segunda às 12h: a quinta 08/10 abre na segunda 05/10 às 12h de Uberlândia", () => {
    expect(dataDeAbertura("2026-10-08", SEGUNDA_12H)).toBe("2026-10-05");
    expect(inicioDasReservas("2026-10-08", SEGUNDA_12H).toISOString()).toBe(ABRE);
    expect(descreverAbertura("2026-10-08", SEGUNDA_12H)).toBe("segunda, 05/10, às 12h");
  });

  it("virada de mês e de ano, minutos e edição no próprio dia da abertura", () => {
    expect(dataDeAbertura("2026-10-01", SEGUNDA_12H)).toBe("2026-09-28");
    expect(dataDeAbertura("2027-01-07", SEGUNDA_12H)).toBe("2027-01-04");
    expect(dataDeAbertura("2026-12-31", SEGUNDA_12H)).toBe("2026-12-28");
    expect(inicioDasReservas("2026-10-08", { dia: 1, hora: "12h30" }).toISOString()).toBe("2026-10-05T15:30:00.000Z");
    expect(dataDeAbertura("2026-10-05", SEGUNDA_12H)).toBe("2026-10-05"); // edição numa segunda: abre no mesmo dia
    expect(dataDeAbertura("2026-10-08", { dia: 4, hora: "9h" })).toBe("2026-10-08"); // quinta → quinta: mesmo dia
    expect(dataDeAbertura("2026-10-08", { dia: 5, hora: "12h" })).toBe("2026-10-02"); // sexta: a sexta anterior
  });

  it("valores do banco fora do formato não viram regra (não inventa abertura)", () => {
    expect(aberturaSemanalDe(1, "12h")).toEqual(SEGUNDA_12H);
    for (const [dia, hora] of [[null, null], [1, null], [null, "12h"], [7, "12h"], [-1, "12h"], [1.5, "12h"], ["1", "12h"], [1, "12:00"], [1, "25h"]]) {
      expect(aberturaSemanalDe(dia, hora), `${dia} ${hora}`).toBeNull();
    }
  });
});

describe("prontidão do site com a abertura semanal (pura)", () => {
  it("antes do horário: não abre, diz quando abre e é a ÚNICA pendência", () => {
    const p = avaliarProntidaoDoSite({ edicao: edicao(), regras: completas(), mesasSite: 2, agora: antes, aberturaSemanal: SEGUNDA_12H });
    expect(p).toEqual({ pronta: false, faltando: ["abertura das reservas (segunda, 05/10, às 12h)"], abreEm: ABRE, abreQuando: "segunda, 05/10, às 12h" });
    expect(soAguardaAbertura(p)).toBe(true);
  });

  it("a partir do horário exato: pronta", () => {
    expect(avaliarProntidaoDoSite({ edicao: edicao(), regras: completas(), mesasSite: 2, agora: depois, aberturaSemanal: SEGUNDA_12H })).toEqual({ pronta: true, faltando: [] });
  });

  it("sem dia fixo (null ou ausente): comportamento de antes, abre assim que está completa", () => {
    expect(avaliarProntidaoDoSite({ edicao: edicao(), regras: completas(), mesasSite: 2, agora: antes, aberturaSemanal: null }).pronta).toBe(true);
    expect(avaliarProntidaoDoSite({ edicao: edicao(), regras: completas(), mesasSite: 2, agora: antes }).pronta).toBe(true);
  });

  it("faltando outra coisa além da abertura: não conta como 'agendada'", () => {
    const p = avaliarProntidaoDoSite({ edicao: edicao(), regras: completas({ reservas_site: false }), mesasSite: 2, agora: antes, aberturaSemanal: SEGUNDA_12H });
    expect(p.pronta).toBe(false);
    expect(p.faltando).toContain("liberação da edição para reservas pelo site");
    expect(soAguardaAbertura(p)).toBe(false);
  });

  it("a abertura não libera nada sozinha: depois do horário, campos faltando continuam barrando", () => {
    const p = avaliarProntidaoDoSite({ edicao: edicao(), regras: completas({ capacidade_maxima: null }), mesasSite: 2, agora: depois, aberturaSemanal: SEGUNDA_12H });
    expect(p).toEqual({ pronta: false, faltando: ["capacidade máxima"] });
  });
});

describe("copiar regras da quinta anterior (puro)", () => {
  it("copia tudo, leva o prazo final junto com a data e mantém as observações desta edição", () => {
    const modelo = completas({ preco_centavos: 3000, observacoes: "nota da semana passada", atendimento_automatico: true, reservas_ate: "2026-10-01T21:00:00.000Z" });
    expect(regrasCopiadas(modelo, "2026-10-01", "2026-10-08", "nota desta semana")).toEqual({ ...modelo, reservas_ate: "2026-10-08T21:00:00.000Z", observacoes: "nota desta semana" });
  });

  it("prazo vazio continua vazio; edição sem nenhuma regra não serve de modelo", () => {
    expect(regrasCopiadas(completas({ reservas_ate: null }), "2026-10-01", "2026-10-15", "").reservas_ate).toBeNull();
    expect(temRegras(REGRAS_VAZIAS)).toBe(false);
    expect(temRegras({ ...REGRAS_VAZIAS, consumacao_minima_centavos: 0 })).toBe(true);
  });
});

describe("validarAberturaSemanal (Configurações da casa)", () => {
  it("sem os campos: não mexe; os dois vazios: sem dia fixo", () => {
    expect(validarAberturaSemanal({ casa_bairro: "Centro" })).toEqual({ campos: null });
    expect(validarAberturaSemanal({ reservas_abrem_dia: null, reservas_abrem_hora: "" })).toEqual({ campos: { reservas_abrem_dia: null, reservas_abrem_hora: null } });
  });

  it("aceita dia de 0 a 6 e horário no formato da casa", () => {
    expect(validarAberturaSemanal({ reservas_abrem_dia: 1, reservas_abrem_hora: " 12h " })).toEqual({ campos: { reservas_abrem_dia: 1, reservas_abrem_hora: "12h" } });
    expect(validarAberturaSemanal({ reservas_abrem_dia: "0", reservas_abrem_hora: "9h30" })).toEqual({ campos: { reservas_abrem_dia: 0, reservas_abrem_hora: "9h30" } });
  });

  it("recusa só um dos dois, dia fora da semana e horário inválido", () => {
    expect(validarAberturaSemanal({ reservas_abrem_dia: 1, reservas_abrem_hora: "" })).toHaveProperty("erro");
    expect(validarAberturaSemanal({ reservas_abrem_dia: null, reservas_abrem_hora: "12h" })).toHaveProperty("erro");
    expect(validarAberturaSemanal({ reservas_abrem_dia: 7, reservas_abrem_hora: "12h" })).toHaveProperty("erro");
    expect(validarAberturaSemanal({ reservas_abrem_dia: 1, reservas_abrem_hora: "12:00" })).toHaveProperty("erro");
  });
});

let banco: BancoTeste;
let bancoSemColunas: BancoTeste;
beforeAll(async () => { banco = await criarBancoTeste(); bancoSemColunas = await criarBancoTeste({ abertura: false }); });
afterAll(async () => { definirBanco(null); await banco.pg.close(); await bancoSemColunas.pg.close(); });

// Quinta 08/01/2099 → abre na segunda 05/01/2099 às 12h (15h UTC).
const ED = "2099-01-08";
const ANTES_2099 = new Date("2099-01-05T14:59:00Z");
const DEPOIS_2099 = new Date("2099-01-05T15:00:00Z");

async function cenario(b: BancoTeste) {
  definirBanco(b);
  _reiniciarCacheDeCanais();
  await b.limpar();
  await criarEdicao(b, { id: ED });
  await criarMesa(b, "T1", 4);
  await liberarEdicaoParaSite(b, ED);
}

describe("abertura semanal no banco (migração aplicada)", () => {
  beforeEach(() => cenario(banco));

  it("a migração grava segunda às 12h na primeira aplicação e, rodando de novo, nunca desfaz a escolha do painel", async () => {
    const { readFileSync } = await import("node:fs");
    const ler = (arq: string) => readFileSync(`${process.cwd()}/supabase/${arq}`, "utf8");
    const novo = await criarBancoTeste({ abertura: false });
    try {
      const abertura = () => novo.sql("select reservas_abrem_dia, reservas_abrem_hora from site_config");
      await novo.pg.exec(ler("migracao-2026-10-05-abertura-semanal.sql"));
      expect(await abertura()).toEqual([{ reservas_abrem_dia: 1, reservas_abrem_hora: "12h" }]);
      await novo.sql("update site_config set reservas_abrem_dia = null, reservas_abrem_hora = null"); // "sem dia fixo" no painel
      await novo.pg.exec(ler("migracao-2026-10-05-abertura-semanal.sql"));
      expect(await abertura()).toEqual([{ reservas_abrem_dia: null, reservas_abrem_hora: null }]);
      await novo.pg.exec(ler("reverter-2026-10-05-abertura-semanal.sql"));
      expect(Object.keys((await novo.sql("select * from site_config"))[0])).not.toContain("reservas_abrem_dia");
    } finally {
      await novo.pg.close();
    }
  });

  it("o banco recusa dia fora da semana, horário inválido ou só um dos dois", async () => {
    await expect(banco.sql("update site_config set reservas_abrem_dia = 7, reservas_abrem_hora = '12h'")).rejects.toThrow();
    await expect(banco.sql("update site_config set reservas_abrem_dia = 1, reservas_abrem_hora = '12:00'")).rejects.toThrow();
    await expect(banco.sql("update site_config set reservas_abrem_dia = 1, reservas_abrem_hora = null")).rejects.toThrow();
    await expect(banco.sql("update site_config set reservas_abrem_dia = null, reservas_abrem_hora = '12h'")).rejects.toThrow();
  });

  it("sem dia fixo (linha vazia): a edição completa abre na hora, como antes", async () => {
    expect((await edicoesProntasParaSite(ANTES_2099)).map((p) => p.edicao.id)).toEqual([ED]);
  });

  it("segunda às 12h: fechada antes (site, POST e mapa usam a mesma checagem) e aberta a partir do horário", async () => {
    await banco.sql("update site_config set reservas_abrem_dia = 1, reservas_abrem_hora = '12h' where id = 1");
    expect(await edicoesProntasParaSite(ANTES_2099)).toEqual([]);
    expect(await edicaoProntaParaSite(ED, ANTES_2099)).toBeNull();
    const situacao = await situacaoDoSite(ANTES_2099);
    expect(situacao.prontas).toEqual([]);
    expect(situacao.proximaAbertura).toMatchObject({ edicao: { id: ED }, abreEm: "2099-01-05T15:00:00.000Z", descricao: "segunda, 05/01, às 12h" });

    expect((await edicoesProntasParaSite(DEPOIS_2099)).map((p) => p.edicao.id)).toEqual([ED]);
    expect(await edicaoProntaParaSite(ED, DEPOIS_2099)).not.toBeNull();
    expect((await situacaoDoSite(DEPOIS_2099)).proximaAbertura).toBeNull();
  });

  it("edição incompleta não aparece como 'abre segunda' (só a que está pronta e esperando)", async () => {
    await banco.sql("update site_config set reservas_abrem_dia = 1, reservas_abrem_hora = '12h' where id = 1");
    await liberarEdicaoParaSite(banco, ED, { sem: "capacidade_maxima" });
    expect((await situacaoDoSite(ANTES_2099)).proximaAbertura).toBeNull();
  });

  it("o painel mostra a edição como agendada, com o dia e a hora", async () => {
    await banco.sql("update site_config set reservas_abrem_dia = 1, reservas_abrem_hora = '12h' where id = 1");
    const painel = await carregarPainelDeRegras(ED, ANTES_2099);
    if (!painel.migrado) throw new Error("esperava banco migrado");
    expect(soAguardaAbertura(painel.prontidaoSite)).toBe(true);
    expect(painel.prontidaoSite.abreQuando).toBe("segunda, 05/01, às 12h");
  });

  it("Configurações da casa: lê e grava o dia e o horário pelo painel", async () => {
    let j = await (await lerConfig()).json();
    expect(j.config).toMatchObject({ abertura_migrada: true, reservas_abrem_dia: null, reservas_abrem_hora: null });

    const put = (corpo: unknown) => gravarConfig(new Request("http://localhost/api/admin/config", { method: "PUT", body: JSON.stringify(corpo) }));
    expect((await put({ casa_bairro: "Centro", reservas_abrem_dia: 1, reservas_abrem_hora: "12h" })).status).toBe(200);
    j = await (await lerConfig()).json();
    expect(j.config).toMatchObject({ casa_bairro: "Centro", reservas_abrem_dia: 1, reservas_abrem_hora: "12h" });

    expect((await put({ reservas_abrem_dia: 1, reservas_abrem_hora: "" })).status).toBe(400);
    expect((await put({ reservas_abrem_dia: null, reservas_abrem_hora: "" })).status).toBe(200);
    expect(await banco.sql("select reservas_abrem_dia, reservas_abrem_hora from site_config")).toEqual([{ reservas_abrem_dia: null, reservas_abrem_hora: null }]);
  });
});

describe("banco SEM a migração da abertura semanal", () => {
  beforeEach(() => cenario(bancoSemColunas));

  it("o site segue como antes (abre assim que completa), sem erro", async () => {
    expect((await edicoesProntasParaSite(ANTES_2099)).map((p) => p.edicao.id)).toEqual([ED]);
    expect(await edicaoProntaParaSite(ED, ANTES_2099)).not.toBeNull();
  });

  it("Configurações da casa: avisa que não está migrado, salva o resto e recusa a abertura com 503", async () => {
    const j = await (await lerConfig()).json();
    expect(j.config.abertura_migrada).toBe(false);
    const put = (corpo: unknown) => gravarConfig(new Request("http://localhost/api/admin/config", { method: "PUT", body: JSON.stringify(corpo) }));
    expect((await put({ casa_bairro: "Centro" })).status).toBe(200);
    expect((await put({ reservas_abrem_dia: 1, reservas_abrem_hora: "12h" })).status).toBe(503);
  });
});
