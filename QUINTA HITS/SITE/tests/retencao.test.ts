import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { NextResponse } from "next/server";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { criarEdicao, criarMesa } from "./helpers/cenarios";

const sessao = vi.hoisted(() => ({ autenticado: true }));
vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});
vi.mock("@/lib/adminSessao", () => ({
  exigirSessao: async () => (sessao.autenticado ? null : NextResponse.json({ erro: "Não autenticado." }, { status: 401 })),
}));

import { executarRetencao, podeExecutar } from "@/lib/agente/retencao";
import { POST } from "@/app/api/admin/whatsapp/retencao/route";

const AGORA = new Date("2026-09-21T15:00:00Z");
const dias = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString();
const meses = (n: number) => { const d = new Date(AGORA.getTime()); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString(); };

let banco: BancoTeste;
let bancoAntigo: BancoTeste;
beforeAll(async () => { banco = await criarBancoTeste(); bancoAntigo = await criarBancoTeste({ migracao: false }); });
afterAll(async () => { definirBanco(null); await banco.pg.close(); await bancoAntigo.pg.close(); });

const contagens = async () => (await banco.sql<{ n: number }>("select (select count(*) from wa_mensagens)::int + (select count(*) from wa_fila_saida)::int + (select count(*) from wa_webhook_eventos)::int + (select count(*) from wa_contatos where anonimizado_em is not null)::int as n"))[0].n;

/** Cenário com dados de todas as idades. Tudo fictício. */
async function cenario() {
  const [c1] = await banco.sql<{ id: string }>("insert into wa_contatos (wa_id, telefone, nome, observacoes) values ('5534911110001','34911110001','Cliente Antigo','obs sensível') returning id");
  const [c2] = await banco.sql<{ id: string }>("insert into wa_contatos (wa_id, telefone, nome) values ('5534911110002','34911110002','Cliente com Reserva Aberta') returning id");
  const [c3] = await banco.sql<{ id: string }>("insert into wa_contatos (wa_id, telefone, nome) values ('5534911110003','34911110003','Cliente Recente') returning id");
  const conv = async (contato: string, encerradaHa: number | null) =>
    (await banco.sql<{ id: string }>("insert into wa_conversas (contato_id, status, estado, contexto, encerrada_em) values ($1,$2,'CLOSED','{\"pessoas\":4}',$3) returning id", [contato, encerradaHa === null ? "agente" : "encerrada", encerradaHa === null ? null : meses(encerradaHa)]))[0].id;
  const conv1 = await conv(c1.id, 13);
  await conv(c2.id, 14);
  await conv(c3.id, 2);

  const msg = (conversa: string, ha: number, texto: string, wamid: string, erro: string | null = null) =>
    banco.sql("insert into wa_mensagens (wamid, conversa_id, direcao, autor, status, conteudo, criada_em, erro_codigo, erro_detalhe) values ($1,$2,'entrada','cliente','recebida',$3,$4,$5,$6)", [wamid, conversa, texto, dias(ha), erro ? "131047" : null, erro]);
  await msg(conv1, 10, "mensagem recente", "w.recente");
  await msg(conv1, 100, "mensagem de 100 dias", "w.100d", "detalhe de erro antigo");
  await msg(conv1, 200, "mensagem de 200 dias", "w.200d");
  await msg(conv1, 400, "mensagem de 400 dias", "w.400d");

  const fila = (ha: number, status: string, chave: string) =>
    banco.sql("insert into wa_fila_saida (conversa_id, para, tipo, payload, status, chave_idempotencia, criada_em) values ($1,'5534911110001','texto',$2,$3,$4,$5)", [conv1, JSON.stringify({ mensagem: { tipo: "texto", corpo: "texto na fila" } }), status, chave, dias(ha)]);
  await fila(5, "enviada", "f.recente");
  await fila(100, "enviada", "f.100d");
  await fila(100, "pendente", "f.pendente");
  await fila(400, "falhou", "f.400d");

  for (const [id, ha] of [["e.novo", 5], ["e.31d", 31], ["e.90d", 90]] as const) await banco.sql("insert into wa_webhook_eventos (id, tipo, destino, recebido_em) values ($1,'message','quinta_hits',$2)", [id, dias(ha)]);

  // reservas: uma futura ABERTA do contato c2 (criada há muito tempo), uma antiga já passada, uma recente
  const ed = await criarEdicao(banco, { id: "2099-01-07", horario: "20h" });
  await banco.sql("insert into edicoes (id, data, local, status) values ('2000-01-06','2000-01-06','Florindos Bar','realizada')");
  const [t1, t2, t3] = [await criarMesa(banco, "T1"), await criarMesa(banco, "T2"), await criarMesa(banco, "T3")];
  await banco.sql("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, status, codigo, created_at) values ($1,$2,'Aberta Futura','34911110002',2,'confirmada','QH-000001',$3)", [ed, t1, meses(30)]);
  await banco.sql("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, status, codigo, created_at) values ('2000-01-06',$1,'Passada Antiga','34955550000',2,'confirmada','QH-000002',$2)", [t2, meses(30)]);
  await banco.sql("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, status, codigo, created_at) values ($1,$2,'Recente','34966660000',2,'aguardando','QH-000003',$3)", [ed, t3, dias(3)]);
  return { c1: c1.id, c2: c2.id, c3: c3.id };
}

describe("podeExecutar (a execução real nasce bloqueada)", () => {
  const ok = { limpeza_ativa: true, ambiente: "homologacao" as const, politica_retencao_validada_em: null };
  it("exige a variável, o banco ligado, o mesmo ambiente e, em produção, a política validada", () => {
    expect(podeExecutar(ok, { retencaoEnv: "true", ambienteApp: "homologacao" }).ok).toBe(true);
    expect(podeExecutar(ok, { retencaoEnv: undefined, ambienteApp: "homologacao" })).toMatchObject({ ok: false });
    expect(podeExecutar(ok, { retencaoEnv: "false", ambienteApp: "homologacao" }).ok).toBe(false);
    expect(podeExecutar({ ...ok, limpeza_ativa: false }, { retencaoEnv: "true", ambienteApp: "homologacao" }).ok).toBe(false);
    expect(podeExecutar(ok, { retencaoEnv: "true", ambienteApp: "producao" }).ok).toBe(false);
    expect(podeExecutar({ ...ok, ambiente: "producao" }, { retencaoEnv: "true", ambienteApp: "producao" }).motivo).toContain("não validada");
    expect(podeExecutar({ ...ok, ambiente: "producao", politica_retencao_validada_em: "2026-10-01T00:00:00Z" }, { retencaoEnv: "true", ambienteApp: "producao" }).ok).toBe(true);
  });
});

describe("rotina de retenção", () => {
  beforeEach(async () => {
    definirBanco(banco);
    sessao.autenticado = true;
    await banco.limpar();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("SIMULAÇÃO (padrão): conta o que seria afetado e NÃO altera nada", async () => {
    await cenario();
    const antes = JSON.stringify(await banco.sql("select * from wa_mensagens order by wamid"));
    const r = await executarRetencao(banco.supabase, { agora: AGORA });
    expect(r.simulado).toBe(true);
    expect(r.contagens).toMatchObject({
      mensagens_conteudo_removido: 3, // 100d, 200d e 400d passaram de 90 dias
      mensagens_apagadas: 1, // só a de 400d passou de 12 meses
      wa_mensagens_erro_detalhe_limpo: 1,
      fila_payload_limpo: 2, // terminais com mais de 90 dias (a pendente fica)
      fila_apagada: 1,
      eventos_webhook_apagados: 2, // 31d e 90d
      contatos_anonimizados: 1, // só o cliente antigo, sem reserva aberta
      reservas_anonimizadas: 1, // só a passada de 30 meses
    });
    expect(JSON.stringify(await banco.sql("select * from wa_mensagens order by wamid"))).toBe(antes);
    expect((await banco.sql("select 1 from wa_contatos where anonimizado_em is not null")).length).toBe(0);
    expect((await banco.sql<{ nome: string }>("select nome from reservas where codigo = 'QH-000002'"))[0].nome).toBe("Passada Antiga");
  });

  it("registra na auditoria SÓ as quantidades, nunca o conteúdo", async () => {
    await cenario();
    await executarRetencao(banco.supabase, { agora: AGORA });
    const [a] = await banco.sql<{ ator: string; acao: string; detalhe: Record<string, number> }>("select ator, acao, detalhe from auditoria");
    expect(a).toMatchObject({ ator: "sistema", acao: "retencao_simulada" });
    expect(Object.values(a.detalhe).every((v) => typeof v === "number")).toBe(true);
    const bruto = JSON.stringify(a);
    for (const proibido of ["mensagem de 100 dias", "Cliente Antigo", "34911110001", "detalhe de erro antigo", "texto na fila"]) expect(bruto).not.toContain(proibido);
  });

  it("execução real RECUSADA por padrão (variável desligada e limpeza desligada): lança e não altera nada", async () => {
    await cenario();
    const antes = await contagens();
    await expect(executarRetencao(banco.supabase, { agora: AGORA, simular: false })).rejects.toThrow(/execução real recusada/);
    await banco.sql("update wa_config set limpeza_ativa = true, ambiente = 'homologacao'");
    await expect(executarRetencao(banco.supabase, { agora: AGORA, simular: false, ambienteApp: "homologacao" })).rejects.toThrow(/RETENCAO_ENABLED/);
    expect(await contagens()).toBe(antes);
  });

  it("execução real (permitida): apaga o conteúdo, mantém a linha, limpa o detalhe de erro, remove o que passou de 12 meses e anonimiza", async () => {
    await cenario();
    await banco.sql("update wa_config set limpeza_ativa = true, ambiente = 'homologacao'");
    const r = await executarRetencao(banco.supabase, { agora: AGORA, simular: false, retencaoEnv: "true", ambienteApp: "homologacao" });
    expect(r.simulado).toBe(false);

    const m = await banco.sql<{ wamid: string; conteudo: string; conteudo_removido_em: string | null; erro_codigo: string | null; erro_detalhe: string | null }>("select wamid, conteudo, conteudo_removido_em, erro_codigo, erro_detalhe from wa_mensagens order by wamid");
    expect(m.map((x) => x.wamid)).toEqual(["w.100d", "w.200d", "w.recente"]); // a de 400 dias saiu
    const cem = m.find((x) => x.wamid === "w.100d")!;
    expect(cem.conteudo).toBe("");
    expect(cem.conteudo_removido_em).not.toBeNull();
    expect(cem.erro_detalhe).toBeNull(); // detalhe do erro apagado...
    expect(cem.erro_codigo).toBe("131047"); // ...o código do erro fica
    expect(m.find((x) => x.wamid === "w.recente")!.conteudo).toBe("mensagem recente");

    const fila = await banco.sql<{ chave_idempotencia: string; payload: unknown; status: string }>("select chave_idempotencia, payload, status from wa_fila_saida order by chave_idempotencia");
    expect(fila.map((f) => f.chave_idempotencia)).toEqual(["f.100d", "f.pendente", "f.recente"]); // a de 400 dias saiu
    expect(fila.find((f) => f.chave_idempotencia === "f.100d")!.payload).toEqual({});
    expect(JSON.stringify(fila.find((f) => f.chave_idempotencia === "f.pendente")!.payload)).toContain("texto na fila"); // pendente é preservada
    expect(JSON.stringify(fila.find((f) => f.chave_idempotencia === "f.recente")!.payload)).toContain("texto na fila");

    expect((await banco.sql<{ id: string }>("select id from wa_webhook_eventos order by id")).map((e) => e.id)).toEqual(["e.novo"]);

    const anon = await banco.sql<{ wa_id: string; nome: string; telefone: string | null; observacoes: string; anonimizado_em: string | null }>("select wa_id, nome, telefone, observacoes, anonimizado_em from wa_contatos where anonimizado_em is not null");
    expect(anon).toHaveLength(1);
    expect(anon[0].wa_id).toMatch(/^anon-[0-9a-f]{32}$/);
    expect(anon[0]).toMatchObject({ nome: "", telefone: null, observacoes: "" });
    expect((await banco.sql<{ contexto: unknown }>("select contexto from wa_conversas where contato_id = (select id from wa_contatos where anonimizado_em is not null)"))[0].contexto).toEqual({});

    const res = await banco.sql<{ codigo: string; nome: string; whatsapp: string }>("select codigo, nome, whatsapp from reservas order by codigo");
    expect(res.find((x) => x.codigo === "QH-000002")).toMatchObject({ nome: "[removido]", whatsapp: "00000000000" });
  });

  it("RESPEITA reservas abertas e contatos vivos: reserva futura, conversa recente e contato com reserva aberta não são tocados", async () => {
    const { c2, c3 } = await cenario();
    await banco.sql("update wa_config set limpeza_ativa = true, ambiente = 'homologacao'");
    await executarRetencao(banco.supabase, { agora: AGORA, simular: false, retencaoEnv: "true", ambienteApp: "homologacao" });
    const aberta = (await banco.sql<{ nome: string; whatsapp: string }>("select nome, whatsapp from reservas where codigo = 'QH-000001'"))[0];
    expect(aberta).toEqual({ nome: "Aberta Futura", whatsapp: "34911110002" }); // criada há 30 meses, mas a edição é futura
    expect((await banco.sql<{ nome: string }>("select nome from reservas where codigo = 'QH-000003'"))[0].nome).toBe("Recente");
    for (const id of [c2, c3]) expect((await banco.sql<{ anonimizado_em: string | null }>("select anonimizado_em from wa_contatos where id = $1", [id]))[0].anonimizado_em).toBeNull();
  });

  it("é idempotente: uma segunda execução não tem mais nada a fazer", async () => {
    await cenario();
    await banco.sql("update wa_config set limpeza_ativa = true, ambiente = 'homologacao'");
    const opcoes = { agora: AGORA, simular: false, retencaoEnv: "true", ambienteApp: "homologacao" as const };
    await executarRetencao(banco.supabase, opcoes);
    const segunda = await executarRetencao(banco.supabase, opcoes);
    expect(Object.values(segunda.contagens).every((n) => n === 0)).toBe(true);
  });

  it("os prazos são os da configuração: mudar wa_config muda o corte", async () => {
    await cenario();
    await banco.sql("update wa_config set retencao_conteudo_mensagens_dias = 5, retencao_eventos_webhook_dias = 2");
    const r = await executarRetencao(banco.supabase, { agora: AGORA });
    expect(r.contagens.mensagens_conteudo_removido).toBe(4); // agora até a de 10 dias passa do corte
    expect(r.contagens.eventos_webhook_apagados).toBe(3);
  });

  it("nunca escreve conteúdo apagado nos logs", async () => {
    await cenario();
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "info")];
    await executarRetencao(banco.supabase, { agora: AGORA });
    expect(JSON.stringify(logs.flatMap((l) => l.mock.calls))).not.toMatch(/mensagem de 100 dias|Cliente Antigo|34911110001/);
  });

  it("sem a migração aplicada: lança um erro claro em vez de mexer em qualquer coisa", async () => {
    await expect(executarRetencao(bancoAntigo.supabase, { agora: AGORA })).rejects.toThrow(/migração não aplicada/);
  });
});

describe("rota do painel: POST /api/admin/whatsapp/retencao", () => {
  const post = (corpo: unknown) => POST(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }));
  beforeEach(async () => {
    definirBanco(banco);
    sessao.autenticado = true;
    await banco.limpar();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("sem sessão: 401", async () => {
    sessao.autenticado = false;
    expect((await post({})).status).toBe(401);
  });

  it("padrão é SIMULAR; pedir execução sem as permissões dá 409 e não altera nada", async () => {
    await cenario();
    const sim = await (await post({})).json();
    expect(sim.simulado).toBe(true);
    const antes = await contagens();
    const r = await post({ executar: true });
    expect(r.status).toBe(409);
    expect((await r.json()).erro).toMatch(/execução real recusada/);
    expect(await contagens()).toBe(antes);
  });

  it("executa de verdade só com tudo liberado (em produção, com a política validada)", async () => {
    await cenario();
    vi.stubEnv("RETENCAO_ENABLED", "true");
    await banco.sql("update wa_config set limpeza_ativa = true, politica_retencao_validada_em = now()");
    const r = await post({ executar: true });
    expect(r.status).toBe(200);
    expect((await r.json()).simulado).toBe(false);
  });
});

describe("script scripts/retencao.mjs (sem rede e sem credenciais)", () => {
  const raiz = fileURLToPath(new URL("../", import.meta.url));
  const rodar = (args: string[], env: Record<string, string> = {}) =>
    spawnSync(process.execPath, ["scripts/retencao.mjs", ...args], { cwd: raiz, encoding: "utf8", env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env } as unknown as NodeJS.ProcessEnv });

  it("recusa rodar sem --ambiente=homologacao", () => {
    const r = rodar([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("só roda em HOMOLOGAÇÃO");
  });
  it("recusa sem APP_AMBIENTE=homologacao e sem as variáveis do Supabase de homologação", () => {
    expect(rodar(["--ambiente=homologacao"]).stderr).toContain("APP_AMBIENTE");
    const r = rodar(["--ambiente=homologacao"], { APP_AMBIENTE: "homologacao" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("variáveis do Supabase");
  });
  it("carrega o módulo TypeScript direto no Node (sem compilar) e nunca imprime credenciais", () => {
    const r = rodar(["--ambiente=homologacao"], { APP_AMBIENTE: "homologacao" });
    expect(r.stdout + r.stderr).not.toMatch(/eyJ|service_role|SUPABASE_SERVICE_ROLE_KEY=/);
    expect(r.stderr).not.toMatch(/ERR_MODULE_NOT_FOUND|SyntaxError|Cannot find/);
  });
});
