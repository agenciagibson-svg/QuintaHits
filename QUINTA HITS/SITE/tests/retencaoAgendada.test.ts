import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { obterOuAbrirConversa, obterOuCriarContato } from "@/lib/agente/repositorio";
import { abrirTransferencia } from "@/lib/agente/atendimento";

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});

import { GET } from "@/app/api/cron/retencao/route";
import { executarRetencao } from "@/lib/agente/retencao";

let banco: BancoTeste;
beforeAll(async () => { banco = await criarBancoTeste(); });
afterAll(async () => { definirBanco(null); await banco.pg.close(); });

const SEGREDO = "cron-secreto-de-teste-1234567890";
const chamar = (autorizacao?: string) => GET(new Request("http://localhost/api/cron/retencao", { headers: autorizacao ? { authorization: autorizacao } : {} }));

/** Uma nota interna e uma mensagem, ambas com 200 dias de idade (passaram dos 90 dias de conteúdo). */
async function cenarioAntigo() {
  const contato = await obterOuCriarContato("5534999998888", "Ana");
  const conv = await obterOuAbrirConversa(contato.id);
  await abrirTransferencia(conv.id, "outro", "x");
  const [t] = await banco.sql<{ id: string }>("select id from wa_transferencias");
  await banco.sql("insert into wa_notas_internas (transferencia_id, conversa_id, autor, texto, criada_em) values ($1,$2,'equipe@teste.com','nota antiga', now() - interval '200 days')", [t.id, conv.id]);
  await banco.sql("insert into wa_notas_internas (transferencia_id, conversa_id, autor, texto) values ($1,$2,'equipe@teste.com','nota de hoje')", [t.id, conv.id]);
  await banco.sql("insert into wa_mensagens (conversa_id, direcao, autor, conteudo, status, criada_em) values ($1,'entrada','cliente','mensagem antiga','recebida', now() - interval '200 days')", [conv.id]);
}

beforeEach(async () => {
  definirBanco(banco);
  await banco.limpar();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("GET /api/cron/retencao (tarefa agendada, ainda NÃO agendada)", () => {
  it("sem CRON_SECRET no ambiente: rota desligada (503) e nada é executado", async () => {
    await cenarioAntigo();
    expect((await chamar(`Bearer ${SEGREDO}`)).status).toBe(503);
    expect((await banco.sql("select 1 from auditoria where acao like 'retencao%'")).length).toBe(0);
  });

  it("segredo curto demais também deixa a rota desligada", async () => {
    vi.stubEnv("CRON_SECRET", "curto");
    expect((await chamar("Bearer curto")).status).toBe(503);
  });

  it("sem cabeçalho, com segredo errado ou pela URL: 401", async () => {
    vi.stubEnv("CRON_SECRET", SEGREDO);
    expect((await chamar()).status).toBe(401);
    expect((await chamar("Bearer errado")).status).toBe(401);
    expect((await chamar(SEGREDO)).status).toBe(401);
    expect((await GET(new Request(`http://localhost/api/cron/retencao?secret=${SEGREDO}`))).status).toBe(401);
  });

  it("padrão: roda em SIMULAÇÃO, conta o que seria afetado e NÃO altera nada", async () => {
    vi.stubEnv("CRON_SECRET", SEGREDO);
    await cenarioAntigo();
    const r = await chamar(`Bearer ${SEGREDO}`);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.simulado).toBe(true);
    expect(j.contagens.notas_internas_apagadas).toBe(1);
    expect(j.contagens.mensagens_conteudo_removido).toBe(1);
    expect((await banco.sql("select 1 from wa_notas_internas")).length).toBe(2);
    expect((await banco.sql<{ conteudo: string }>("select conteudo from wa_mensagens"))[0].conteudo).toBe("mensagem antiga");
    expect((await banco.sql<{ acao: string }>("select acao from auditoria where acao like 'retencao%'")).map((a) => a.acao)).toEqual(["retencao_simulada"]);
  });

  it("RETENCAO_ENABLED ligada, mas o banco não libera (limpeza_ativa desligada): simula em vez de apagar", async () => {
    vi.stubEnv("CRON_SECRET", SEGREDO);
    vi.stubEnv("RETENCAO_ENABLED", "true");
    await cenarioAntigo();
    const j = await (await chamar(`Bearer ${SEGREDO}`)).json();
    expect(j.simulado).toBe(true);
    expect((await banco.sql("select 1 from wa_notas_internas")).length).toBe(2);
  });

  it("valor diferente do texto exato 'true' não libera a execução real", async () => {
    vi.stubEnv("CRON_SECRET", SEGREDO);
    await cenarioAntigo();
    await banco.sql("update wa_config set limpeza_ativa = true, ambiente = 'producao', politica_retencao_validada_em = now()");
    for (const v of ["TRUE", " true", "1", "yes"]) {
      vi.stubEnv("RETENCAO_ENABLED", v);
      expect((await (await chamar(`Bearer ${SEGREDO}`)).json()).simulado, v).toBe(true);
    }
    expect((await banco.sql("select 1 from wa_notas_internas")).length).toBe(2);
  });
});

describe("retenção das notas internas (execução real, só em teste e com tudo liberado)", () => {
  it("apaga a nota antiga (passou de 90 dias) e preserva a de hoje", async () => {
    await cenarioAntigo();
    await banco.sql("update wa_config set limpeza_ativa = true, ambiente = 'homologacao'");
    const r = await executarRetencao(banco.supabase, { simular: false, retencaoEnv: "true", ambienteApp: "homologacao" });
    expect(r.contagens.notas_internas_apagadas).toBe(1);
    expect((await banco.sql<{ texto: string }>("select texto from wa_notas_internas")).map((n) => n.texto)).toEqual(["nota de hoje"]);
    expect(JSON.stringify(await banco.sql("select * from auditoria"))).not.toContain("nota antiga");
  });

  it("sem a tabela de notas (parte 2 não aplicada) a rotina segue sem erro", async () => {
    const parte1 = await criarBancoTeste({ parte2: false });
    try {
      const r = await executarRetencao(parte1.supabase, { simular: true });
      expect(r.contagens.notas_internas_apagadas).toBeUndefined();
      expect(r.simulado).toBe(true);
    } finally {
      await parte1.pg.close();
    }
  });
});
