import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { criarEdicao, criarMesa, liberarEdicaoParaSite } from "./helpers/cenarios";
import { plantaDoBanco, validarPlanta, MAX_ELEMENTOS } from "@/lib/planta";

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

import { GET as lerPlanta, PUT as gravarPlanta } from "@/app/api/admin/planta/route";
import { GET as mapa } from "@/app/api/reservas/mapa/route";
import { _reiniciarCacheDeCanais } from "@/lib/disponibilidade";

let banco: BancoTeste;
let bancoSemPlanta: BancoTeste;
beforeAll(async () => { banco = await criarBancoTeste(); bancoSemPlanta = await criarBancoTeste({ planta: false }); });
afterAll(async () => { definirBanco(null); await banco.pg.close(); await bancoSemPlanta.pg.close(); });

const palco = { id: "palco-1", tipo: "palco", rotulo: "", x: 50, y: 8, w: 40, h: 12 };
const put = (elementos: unknown) => gravarPlanta(new Request("http://localhost/api/admin/planta", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ elementos }) }));

describe("validarPlanta (pura)", () => {
  it("aceita elementos válidos e ajusta posição e tamanho para caber no mapa", () => {
    const r = validarPlanta([palco, { id: "bar", tipo: "bar", rotulo: "  Bar principal  ", x: 130, y: -4, w: 1, h: 30.04 }]);
    expect(r).toEqual({ elementos: [palco, { id: "bar", tipo: "bar", rotulo: "Bar principal", x: 100, y: 0, w: 2, h: 30 }] });
  });

  it("recusa tipo desconhecido, id repetido ou inválido, número não finito e lista grande demais", () => {
    expect(validarPlanta("x")).toHaveProperty("erro");
    expect(validarPlanta([{ ...palco, tipo: "piscina" }])).toHaveProperty("erro");
    expect(validarPlanta([palco, palco])).toHaveProperty("erro");
    expect(validarPlanta([{ ...palco, id: "a b<script>" }])).toHaveProperty("erro");
    expect(validarPlanta([{ ...palco, x: Number.NaN }])).toHaveProperty("erro");
    expect(validarPlanta(Array.from({ length: MAX_ELEMENTOS + 1 }, (_, i) => ({ ...palco, id: `p${i}` })))).toHaveProperty("erro");
  });

  it("o que vem do banco em formato inesperado vira lista vazia (o mapa nunca quebra)", () => {
    expect(plantaDoBanco(null)).toEqual([]);
    expect(plantaDoBanco({ elementos: "x" })).toEqual([]);
    expect(plantaDoBanco({ elementos: [{ id: "x" }] })).toEqual([]);
    expect(plantaDoBanco({ elementos: [palco] })).toEqual([palco]);
  });
});

describe("API da planta no painel", () => {
  beforeEach(async () => {
    sessao.autenticado = true;
    definirBanco(banco);
    await banco.limpar();
  });

  it("sem sessão: 401", async () => {
    sessao.autenticado = false;
    expect((await lerPlanta()).status).toBe(401);
    expect((await put([palco])).status).toBe(401);
  });

  it("começa vazia, grava a lista inteira e lê de volta", async () => {
    expect(await (await lerPlanta()).json()).toEqual({ migrado: true, elementos: [] });
    expect((await put([palco])).status).toBe(200);
    expect(await (await lerPlanta()).json()).toEqual({ migrado: true, elementos: [palco] });
    expect((await put([])).status).toBe(200);
    expect((await (await lerPlanta()).json()).elementos).toEqual([]);
  });

  it("dado inválido: 400 e nada muda", async () => {
    await put([palco]);
    expect((await put([{ ...palco, tipo: "x" }])).status).toBe(400);
    expect((await (await lerPlanta()).json()).elementos).toEqual([palco]);
  });

  it("banco sem a migração da planta: leitura vazia e gravação 503 explicando", async () => {
    definirBanco(bancoSemPlanta);
    await bancoSemPlanta.limpar();
    expect(await (await lerPlanta()).json()).toEqual({ migrado: false, elementos: [] });
    const r = await put([palco]);
    expect(r.status).toBe(503);
    expect((await r.json()).erro).toMatch(/migracao-2026-09-29-planta-do-salao/);
  });
});

describe("mapa público inclui a planta", () => {
  it("devolve mesas, ocupadas e os elementos do salão; sem a migração, planta vazia", async () => {
    vi.stubEnv("RESERVAS_SITE_ENABLED", "true");
    vi.stubEnv("RESERVAS_SITE_MANUAL", "true");
    for (const [b, esperado] of [[banco, [palco]], [bancoSemPlanta, []]] as const) {
      definirBanco(b);
      _reiniciarCacheDeCanais();
      await b.limpar();
      const ed = await criarEdicao(b, { id: "2099-01-07" });
      await criarMesa(b, "T1", 4);
      await liberarEdicaoParaSite(b, ed);
      if (b === banco) { sessao.autenticado = true; await put([palco]); }
      const r = await mapa(new Request(`http://localhost/api/reservas/mapa?edicao=${ed}`));
      expect(r.status).toBe(200);
      const j = await r.json();
      expect(j.mesas).toHaveLength(1);
      expect(j.planta).toEqual(esperado);
    }
  });
});
