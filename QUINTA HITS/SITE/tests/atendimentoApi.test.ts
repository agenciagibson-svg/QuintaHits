import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";

const sessao = vi.hoisted(() => ({ autenticado: true, tarefas: [] as (() => Promise<unknown>)[] }));

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});
vi.mock("@/lib/adminSessao", () => ({
  exigirSessao: async () => (sessao.autenticado ? null : NextResponse.json({ erro: "Não autenticado." }, { status: 401 })),
}));
vi.mock("@/lib/agente/depois", () => ({ agendarDepois: (fn: () => Promise<unknown>) => { sessao.tarefas.push(fn); } }));

import { GET as listar } from "@/app/api/admin/whatsapp/atendimento/route";
import { GET as historico, POST as acionar } from "@/app/api/admin/whatsapp/atendimento/[id]/route";
import { GET as lerConfig, PUT as gravarConfig } from "@/app/api/admin/whatsapp/config/route";
import { abrirTransferencia, assumir, enviarComoAtendente, nomeDeAtendenteValido } from "@/lib/agente/atendimento";
import { gravarMensagem, obterOuAbrirConversa, obterOuCriarContato } from "@/lib/agente/repositorio";

let banco: BancoTeste;
let bancoAntigo: BancoTeste;
beforeAll(async () => { banco = await criarBancoTeste(); bancoAntigo = await criarBancoTeste({ migracao: false }); });
afterAll(async () => { definirBanco(null); await banco.pg.close(); await bancoAntigo.pg.close(); });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const acao = (id: string, corpo: unknown) => acionar(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }), ctx(id));

/** Conversa transferida para a equipe, pronta para o painel. */
async function conversaTransferida(waId = "5534999998888") {
  const contato = await obterOuCriarContato(waId, "Ana");
  const conv = await obterOuAbrirConversa(contato.id);
  await banco.sql("update wa_conversas set status = 'aguardando_humano', estado = 'WAITING_HUMAN', ultima_msg_cliente_em = now() where id = $1", [conv.id]);
  await gravarMensagem({ conversaId: conv.id, direcao: "entrada", autor: "cliente", tipo: "text", conteudo: "Preciso de ajuda", status: "recebida", wamid: `wamid.${waId}` });
  await abrirTransferencia(conv.id, "pedido_do_cliente", "Cliente pediu para falar com a equipe.");
  const [t] = await banco.sql<{ id: string }>("select id from wa_transferencias where conversa_id = $1", [conv.id]);
  return { conv, transferenciaId: t.id };
}

beforeEach(async () => {
  definirBanco(banco);
  sessao.autenticado = true;
  sessao.tarefas.length = 0;
  await banco.limpar();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("nome do atendente", () => {
  it("de 2 a 60 caracteres, sem controle; o resto é recusado", () => {
    expect(nomeDeAtendenteValido("  Marcos  ")).toBe("Marcos");
    for (const ruim of ["", "M", "x".repeat(61), null, 5, undefined]) expect(nomeDeAtendenteValido(ruim)).toBeNull();
  });
});

describe("transferências (lib)", () => {
  it("só uma transferência aberta por conversa: a segunda vira 'ja_existia'", async () => {
    const { conv } = await conversaTransferida();
    expect(await abrirTransferencia(conv.id, "reclamacao", "x")).toBe("ja_existia");
    expect((await banco.sql("select 1 from wa_transferencias")).length).toBe(1);
  });

  it("dois atendentes assumindo AO MESMO TEMPO: só o primeiro assume", async () => {
    const { transferenciaId } = await conversaTransferida();
    const r = await Promise.all([assumir(transferenciaId, "Marcos"), assumir(transferenciaId, "Vitor")]);
    expect(r.filter((x) => x === "ok")).toHaveLength(1);
    expect(r.filter((x) => x === "ja_assumida")).toHaveLength(1);
    const [t] = await banco.sql<{ atendente: string; status: string }>("select atendente, status from wa_transferencias");
    expect(t.status).toBe("assumida");
    expect(["Marcos", "Vitor"]).toContain(t.atendente);
  });

  it("só responde quem ASSUMIU; texto vazio ou enorme é recusado; a resposta vai para a fila como autor 'atendente'", async () => {
    const { transferenciaId } = await conversaTransferida();
    expect(await enviarComoAtendente(transferenciaId, "Marcos", "Olá!")).toBe("nao_esta_com_voce");
    await assumir(transferenciaId, "Marcos");
    expect(await enviarComoAtendente(transferenciaId, "Marcos", "   ")).toBe("invalido");
    expect(await enviarComoAtendente(transferenciaId, "Marcos", "x".repeat(1001))).toBe("invalido");
    expect(await enviarComoAtendente(transferenciaId, "Marcos", "Olá, aqui é da QUINTA HITS!")).toBe("enfileirada");
    const [m] = await banco.sql<{ autor: string; status: string; conteudo: string }>("select autor, status, conteudo from wa_mensagens where direcao = 'saida'");
    expect(m).toEqual({ autor: "atendente", status: "na_fila", conteudo: "Olá, aqui é da QUINTA HITS!" });
    expect((await banco.sql<{ status: string }>("select status from wa_fila_saida"))[0].status).toBe("pendente");
  });
});

describe("API do painel: fila de atendimento", () => {
  it("sem sessão: 401 em todas as rotas e nada é alterado", async () => {
    const { transferenciaId } = await conversaTransferida();
    sessao.autenticado = false;
    expect((await listar()).status).toBe(401);
    expect((await historico(new Request("http://x"), ctx(transferenciaId))).status).toBe(401);
    expect((await acao(transferenciaId, { acao: "assumir", atendente: "Marcos" })).status).toBe(401);
    expect((await lerConfig()).status).toBe(401);
    expect((await gravarConfig(new Request("http://x", { method: "PUT", body: JSON.stringify({ pausa_emergencia: true }) }))).status).toBe(401);
    expect((await banco.sql<{ status: string }>("select status from wa_transferencias"))[0].status).toBe("aguardando");
    expect((await banco.sql<{ pausa_emergencia: boolean }>("select pausa_emergencia from wa_config"))[0].pausa_emergencia).toBe(false);
  });

  it("lista com contador de pendentes, motivo, contato e última mensagem", async () => {
    await conversaTransferida("5534999998888");
    await conversaTransferida("5534988887777");
    const j = await (await listar()).json();
    expect(j).toMatchObject({ migrado: true, pendentes: 2 });
    expect(j.itens[0]).toMatchObject({ motivo: "pedido_do_cliente", status: "aguardando", ultima_mensagem: "Preciso de ajuda" });
    expect(j.itens[0].contato.telefone).toMatch(/^\(34\) 9\d{4}-\d{4}$/);
  });

  it("histórico da conversa e validação do id", async () => {
    const { transferenciaId } = await conversaTransferida();
    const j = await (await historico(new Request("http://x"), ctx(transferenciaId))).json();
    expect(j.mensagens).toHaveLength(1);
    expect(j.mensagens[0]).toMatchObject({ direcao: "entrada", conteudo: "Preciso de ajuda" });
    expect((await historico(new Request("http://x"), ctx("nao-e-uuid"))).status).toBe(400);
    expect((await historico(new Request("http://x"), ctx("00000000-0000-4000-8000-000000000000"))).status).toBe(404);
  });

  it("assumir, responder, devolver ao agente e encerrar, com o nome do atendente na auditoria", async () => {
    const { transferenciaId, conv } = await conversaTransferida();
    expect((await acao(transferenciaId, { acao: "assumir", atendente: "Marcos" })).status).toBe(200);
    expect((await acao(transferenciaId, { acao: "assumir", atendente: "Vitor" })).status).toBe(409);

    const enviado = await acao(transferenciaId, { acao: "enviar", atendente: "Marcos", texto: "Oi Ana, tudo bem?" });
    expect(enviado.status).toBe(200);
    expect(sessao.tarefas).toHaveLength(1); // o processamento da fila é agendado para depois da resposta

    expect((await acao(transferenciaId, { acao: "devolver", atendente: "Marcos" })).status).toBe(200);
    expect((await banco.sql<{ status: string; estado: string }>("select status, estado from wa_conversas where id = $1", [conv.id]))[0]).toEqual({ status: "agente", estado: "WELCOME" });
    expect((await acao(transferenciaId, { acao: "encerrar", atendente: "Marcos" })).status).toBe(404); // já finalizada

    const atores = (await banco.sql<{ ator: string; acao: string }>("select ator, acao from auditoria order by id")).map((a) => `${a.ator}|${a.acao}`);
    expect(atores).toContain("atendente:Marcos|atendimento_assumido");
    expect(atores).toContain("atendente:Marcos|atendimento_devolvido_ao_agente");
    const bruto = JSON.stringify(await banco.sql("select * from auditoria"));
    expect(bruto).not.toContain("Oi Ana");
    expect(bruto).not.toContain("Preciso de ajuda");
  });

  it("encerrar fecha a conversa", async () => {
    const { transferenciaId, conv } = await conversaTransferida();
    await acao(transferenciaId, { acao: "assumir", atendente: "Marcos" });
    expect((await acao(transferenciaId, { acao: "encerrar", atendente: "Marcos" })).status).toBe(200);
    expect((await banco.sql<{ status: string }>("select status from wa_conversas where id = $1", [conv.id]))[0].status).toBe("encerrada");
  });

  it("valida o pedido: nome do atendente, ação e texto; responder sem assumir é 409", async () => {
    const { transferenciaId } = await conversaTransferida();
    expect((await acao(transferenciaId, { acao: "assumir" })).status).toBe(400);
    expect((await acao(transferenciaId, { acao: "assumir", atendente: "M" })).status).toBe(400);
    expect((await acao(transferenciaId, { acao: "explodir", atendente: "Marcos" })).status).toBe(400);
    expect((await acao("invalido", { acao: "assumir", atendente: "Marcos" })).status).toBe(400);
    expect((await acao(transferenciaId, { acao: "enviar", atendente: "Marcos", texto: "oi" })).status).toBe(409);
    await acao(transferenciaId, { acao: "assumir", atendente: "Marcos" });
    expect((await acao(transferenciaId, { acao: "enviar", atendente: "Marcos" })).status).toBe(400);
    expect((await acao(transferenciaId, { acao: "enviar", atendente: "Marcos", texto: "" })).status).toBe(400);
  });

  it("sem a migração aplicada: a lista responde { migrado: false } e a configuração também", async () => {
    definirBanco(bancoAntigo);
    expect(await (await listar()).json()).toEqual({ migrado: false, pendentes: 0, itens: [] });
    expect(await (await lerConfig()).json()).toEqual({ migrado: false });
    expect((await gravarConfig(new Request("http://x", { method: "PUT", body: JSON.stringify({ pausa_emergencia: true }) }))).status).toBe(503);
  });
});

describe("pausa de emergência pelo painel", () => {
  it("liga e desliga a pausa, registra auditoria; só aceita booleano; NÃO liga agente nem envio", async () => {
    const put = (corpo: unknown) => gravarConfig(new Request("http://x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }));
    expect((await put({ pausa_emergencia: true })).status).toBe(200);
    expect((await (await lerConfig()).json()).config).toMatchObject({ pausa_emergencia: true, agente_ativo: false, envio_ativo: false });
    expect((await put({ pausa_emergencia: false })).status).toBe(200);
    expect((await put({ pausa_emergencia: "sim" })).status).toBe(400);
    expect((await put({ agente_ativo: true })).status).toBe(400);
    expect((await banco.sql<{ agente_ativo: boolean; envio_ativo: boolean }>("select agente_ativo, envio_ativo from wa_config"))[0]).toEqual({ agente_ativo: false, envio_ativo: false });
    expect((await banco.sql<{ acao: string }>("select acao from auditoria order by id")).map((a) => a.acao)).toEqual(["pausa_emergencia_ativada", "pausa_emergencia_desativada"]);
  });
});
