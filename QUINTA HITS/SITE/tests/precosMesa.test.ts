import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { criarEdicao, liberarEdicaoParaSite } from "./helpers/cenarios";

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});

import { carregarPainelDeRegras, salvarRegrasECanais } from "@/lib/regras";

let comColuna: BancoTeste;
let semColuna: BancoTeste;
const TABELA = { "2": 12000, "4": 20000, "8": 40000 };

beforeAll(async () => { comColuna = await criarBancoTeste(); semColuna = await criarBancoTeste({ precos: false }); });
afterAll(async () => { definirBanco(null); await comColuna.pg.close(); await semColuna.pg.close(); });

describe("valor por tamanho de mesa", () => {
  it("grava e devolve a tabela sem mexer nas outras regras", async () => {
    definirBanco(comColuna);
    const ed = await criarEdicao(comColuna);
    await liberarEdicaoParaSite(comColuna, ed);
    expect(await salvarRegrasECanais(ed, { regras: { precos_mesa: TABELA } })).toEqual({ ok: true });
    const painel = await carregarPainelDeRegras(ed);
    if (!painel.migrado) throw new Error("esperava migrado");
    expect(painel.regras.precos_mesa).toEqual(TABELA);
    expect(painel.regras.abertura).not.toBeNull();
    expect(painel.regras.reservas_site).toBe(true);
  });

  it("sem a migração: as regras continuam liberadas, nada fecha, e só gravar a tabela é recusado", async () => {
    definirBanco(semColuna);
    const ed = await criarEdicao(semColuna);
    await liberarEdicaoParaSite(semColuna, ed);
    const painel = await carregarPainelDeRegras(ed);
    if (!painel.migrado) throw new Error("esperava migrado");
    expect(painel.parte2).toBe(true);
    expect(painel.regras.reservas_site).toBe(true);
    expect(painel.regras.precos_mesa).toBeNull();
    expect(await salvarRegrasECanais(ed, { regras: { preco_centavos: 20000 } })).toEqual({ ok: true });
    expect(await salvarRegrasECanais(ed, { regras: { precos_mesa: TABELA } })).toMatchObject({ ok: false, status: 503 });
  });
});
