import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";

/**
 * Teste da PRÓPRIA infraestrutura: o adaptador precisa se comportar como o supabase-js/PostgREST no que o
 * projeto usa, senão os demais testes provariam nada.
 */
let banco: BancoTeste;
beforeAll(async () => { banco = await criarBancoTeste(); });
afterAll(async () => { await banco.pg.close(); });
beforeEach(async () => { await banco.limpar(); });

describe("adaptador do banco de teste", () => {
  it("carrega o schema e a migração reais (12 tabelas novas + tabelas do site)", async () => {
    const t = (await banco.sql<{ tablename: string }>("select tablename from pg_tables where schemaname='public'")).map((r) => r.tablename);
    for (const nome of ["edicoes", "mesas", "reservas", "site_config", "wa_config", "wa_contatos", "wa_conversas", "wa_mensagens", "wa_fila_saida", "edicoes_regras", "edicoes_mesas", "auditoria", "reservas_historico"]) {
      expect(t).toContain(nome);
    }
  });

  it("insert().select().single() devolve a linha; datas vêm como texto ISO, como no PostgREST", async () => {
    const { data, error } = await banco.supabase.from("edicoes").insert({ id: "2027-01-07", data: "2027-01-07", artista: "X" }).select("id, data, updated_at").single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ id: "2027-01-07", data: "2027-01-07" });
    expect(typeof (data as { updated_at: string }).updated_at).toBe("string");
    expect((data as { updated_at: string }).updated_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);
  });

  it("violação de índice único vira error.code = '23505' (não lança exceção)", async () => {
    await banco.supabase.from("mesas").insert({ numero: "M1", lugares: 4 });
    const { error } = await banco.supabase.from("mesas").insert({ numero: "M1", lugares: 4 });
    expect(error?.code).toBe("23505");
  });

  it("update/eq/in/order/limit/maybeSingle e contagem sem corpo (head)", async () => {
    await banco.supabase.from("mesas").insert([{ numero: "A", lugares: 2 }, { numero: "B", lugares: 4 }, { numero: "C", lugares: 6 }]);
    const atualizadas = await banco.supabase.from("mesas").update({ ativa: false }).in("numero", ["A", "B"]).select("numero");
    expect((atualizadas.data as unknown[]).length).toBe(2);
    const ativas = await banco.supabase.from("mesas").select("numero").eq("ativa", true).order("numero", { ascending: false }).limit(5);
    expect(ativas.data).toEqual([{ numero: "C" }]);
    const um = await banco.supabase.from("mesas").select("numero").order("numero").limit(1).maybeSingle();
    expect(um.data).toEqual({ numero: "A" });
    const { count } = await banco.supabase.from("mesas").select("id", { count: "exact", head: true }).eq("ativa", false);
    expect(count).toBe(2);
    const muitas = await banco.supabase.from("mesas").select("numero").maybeSingle();
    expect(muitas.error?.code).toBe("PGRST116");
  });

  it("upsert com ignoreDuplicates não falha e devolve só as linhas realmente inseridas", async () => {
    const a = await banco.supabase.from("wa_webhook_eventos").upsert({ id: "e1", tipo: "message", destino: "quinta_hits" }, { onConflict: "id", ignoreDuplicates: true }).select("id");
    const b = await banco.supabase.from("wa_webhook_eventos").upsert({ id: "e1", tipo: "message", destino: "quinta_hits" }, { onConflict: "id", ignoreDuplicates: true }).select("id");
    expect(a.data).toEqual([{ id: "e1" }]);
    expect(b.error).toBeNull();
    expect(b.data).toEqual([]);
  });

  it("jsonb, arrays de texto e relações embutidas (mesas(numero), edicoes(data)) funcionam", async () => {
    await banco.supabase.from("wa_config").update({ numeros_teste: ["5534999998888"] }).eq("id", 1);
    const cfg = await banco.supabase.from("wa_config").select("numeros_teste").eq("id", 1).single();
    expect(cfg.data).toEqual({ numeros_teste: ["5534999998888"] });

    await banco.supabase.from("edicoes").insert({ id: "2027-01-07", data: "2027-01-07" });
    const mesa = await banco.supabase.from("mesas").insert({ numero: "T1", lugares: 4 }).select("id").single();
    await banco.supabase.from("reservas").insert({ edicao_id: "2027-01-07", mesa_id: (mesa.data as { id: string }).id, nome: "[TESTE]", whatsapp: "34999998888", pessoas: 2, codigo: "QH-123456" });
    const r = await banco.supabase.from("reservas").select("id, status, mesas(numero), edicoes(data)").eq("codigo", "QH-123456").maybeSingle();
    expect(r.data).toMatchObject({ status: "aguardando", mesas: { numero: "T1" }, edicoes: { data: "2027-01-07" } });

    await banco.supabase.from("wa_contatos").insert({ wa_id: "5534999998888" });
    const [c] = await banco.sql<{ id: string }>("select id from wa_contatos");
    const conv = await banco.supabase.from("wa_conversas").insert({ contato_id: c.id, contexto: { pessoas: 4, etapa: "x" } }).select("contexto").single();
    expect(conv.data).toEqual({ contexto: { pessoas: 4, etapa: "x" } });
  });

  it("limpar() apaga tudo e recria as linhas únicas de configuração", async () => {
    await banco.supabase.from("mesas").insert({ numero: "Z", lugares: 2 });
    await banco.limpar();
    expect((await banco.sql("select 1 from mesas")).length).toBe(0);
    expect((await banco.sql("select 1 from wa_config")).length).toBe(1);
    expect((await banco.sql("select 1 from site_config")).length).toBe(1);
  });

  it("a rede está bloqueada por padrão nos testes", async () => {
    await expect(fetch("https://graph.facebook.com/v21.0/123/messages")).rejects.toThrow(/Rede bloqueada/);
  });
});
