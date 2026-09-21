import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { criarEdicao, criarMesa } from "./helpers/cenarios";

const sessao = vi.hoisted(() => ({ autenticado: true, email: "atendente@teste.com" }));

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});
vi.mock("@/lib/adminSessao", () => ({
  exigirSessao: async () => (sessao.autenticado ? null : NextResponse.json({ erro: "Não autenticado." }, { status: 401 })),
  atorDaSessao: async () => sessao.email,
}));
vi.mock("@/lib/agente/depois", () => ({ agendarDepois: () => undefined }));

import { GET as listar } from "@/app/api/admin/whatsapp/atendimento/route";
import { GET as detalhe, POST as acionar } from "@/app/api/admin/whatsapp/atendimento/[id]/route";
import { abrirTransferencia } from "@/lib/agente/atendimento";
import { gravarMensagem, obterOuAbrirConversa, obterOuCriarContato } from "@/lib/agente/repositorio";
import { telefoneMascarado } from "@/lib/agente/telefone";

let banco: BancoTeste;
let bancoParte1: BancoTeste; // parte 1 aplicada, parte 2 ainda NÃO (estado do banco atual antes da parte 2)
beforeAll(async () => { banco = await criarBancoTeste(); bancoParte1 = await criarBancoTeste({ parte2: false }); });
afterAll(async () => { definirBanco(null); await banco.pg.close(); await bancoParte1.pg.close(); });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const acao = (id: string, corpo: unknown) => acionar(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }), ctx(id));
const listarPor = (status?: string) => listar(new Request(`http://localhost/api/admin/whatsapp/atendimento${status ? `?status=${status}` : ""}`));

async function conversa(b: BancoTeste, o: { waId?: string; contexto?: Record<string, unknown>; mensagens?: string[] } = {}) {
  const contato = await obterOuCriarContato(o.waId ?? "5534999998888", "Ana");
  const conv = await obterOuAbrirConversa(contato.id);
  await b.sql("update wa_conversas set status = 'aguardando_humano', estado = 'WAITING_HUMAN', ultima_msg_cliente_em = now(), contexto = $2::jsonb where id = $1", [conv.id, JSON.stringify(o.contexto ?? {})]);
  let n = 0;
  for (const texto of o.mensagens ?? ["Preciso de ajuda"]) {
    await gravarMensagem({ conversaId: conv.id, direcao: "entrada", autor: "cliente", tipo: "text", conteudo: texto, status: "recebida", wamid: `wamid.${o.waId ?? "x"}.${n++}` });
  }
  await abrirTransferencia(conv.id, "pedido_do_cliente", "Cliente pediu a equipe.");
  const [t] = await b.sql<{ id: string }>("select id from wa_transferencias where conversa_id = $1", [conv.id]);
  return { conv, transferenciaId: t.id, contato };
}

beforeEach(async () => {
  definirBanco(banco);
  sessao.autenticado = true;
  sessao.email = "atendente@teste.com";
  await banco.limpar();
  await bancoParte1.limpar();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("filtros por status", () => {
  it("abertas (padrão) mostra aguardando e assumidas; cada status e 'todas' mostram o que dizem; filtro desconhecido é 400", async () => {
    const a = await conversa(banco, { waId: "5534999990001" });
    const b = await conversa(banco, { waId: "5534999990002" });
    const c = await conversa(banco, { waId: "5534999990003" });
    await acao(b.transferenciaId, { acao: "assumir" });
    await acao(c.transferenciaId, { acao: "assumir" });
    await acao(c.transferenciaId, { acao: "encerrar" });

    const status = async (f?: string) => (await (await listarPor(f)).json()).itens.map((i: { status: string }) => i.status).sort();
    expect(await status()).toEqual(["assumida", "aguardando"].sort());
    expect(await status("aguardando")).toEqual(["aguardando"]);
    expect(await status("assumida")).toEqual(["assumida"]);
    expect(await status("encerrada")).toEqual(["encerrada"]);
    expect(await status("devolvida")).toEqual([]);
    expect(await status("todas")).toEqual(["aguardando", "assumida", "encerrada"]);
    expect((await listarPor("qualquer-coisa")).status).toBe(400);
    expect((await (await listarPor()).json()).pendentes).toBe(1);
    expect(a.transferenciaId).toBeTruthy();
  });
});

describe("mensagens não lidas", () => {
  it("contam as mensagens do cliente desde a última leitura; abrir o atendimento (marcar_lida) zera; nova mensagem volta a contar", async () => {
    const { transferenciaId, conv } = await conversa(banco, { mensagens: ["oi", "alguém aí?", "preciso de ajuda"] });
    const lista = await (await listarPor()).json();
    expect(lista.itens[0].nao_lidas).toBe(3);
    expect(lista.nao_lidas).toBe(3);

    const r = await (await acao(transferenciaId, { acao: "marcar_lida" })).json();
    expect(r).toMatchObject({ ok: true, aplicada: true });
    expect((await (await listarPor()).json()).itens[0].nao_lidas).toBe(0);

    await banco.sql("select pg_sleep(0.01)");
    await gravarMensagem({ conversaId: conv.id, direcao: "entrada", autor: "cliente", tipo: "text", conteudo: "mais uma", status: "recebida", wamid: "wamid.nova" });
    expect((await (await listarPor()).json()).itens[0].nao_lidas).toBe(1);
  });

  it("marcar_lida em atendimento inexistente é 404", async () => {
    expect((await acao("00000000-0000-4000-8000-000000000000", { acao: "marcar_lida" })).status).toBe(404);
  });
});

describe("notas internas", () => {
  it("a equipe escreve e lê notas; o autor é o e-mail logado; a nota NUNCA vai para a fila do cliente", async () => {
    const { transferenciaId } = await conversa(banco);
    expect((await acao(transferenciaId, { acao: "nota", texto: "Ligar depois das 18h, cliente do grupo VIP." })).status).toBe(200);
    sessao.email = "outra@teste.com";
    expect((await acao(transferenciaId, { acao: "nota", texto: "Confirmado por telefone." })).status).toBe(200);

    const j = await (await detalhe(new Request("http://x"), ctx(transferenciaId))).json();
    expect(j.notas.map((n: { autor: string; texto: string }) => `${n.autor}: ${n.texto}`)).toEqual([
      "atendente@teste.com: Ligar depois das 18h, cliente do grupo VIP.",
      "outra@teste.com: Confirmado por telefone.",
    ]);
    expect((await banco.sql("select 1 from wa_fila_saida")).length).toBe(0);
    expect((await banco.sql("select 1 from wa_mensagens where direcao = 'saida'")).length).toBe(0);
    const bruto = JSON.stringify(await banco.sql("select * from auditoria"));
    expect(bruto).not.toContain("Ligar depois");
    expect((await banco.sql<{ acao: string }>("select acao from auditoria")).map((a) => a.acao)).toContain("nota_interna_adicionada");
  });

  it("nota vazia, gigante ou sem texto é 400; sem sessão é 401", async () => {
    const { transferenciaId } = await conversa(banco);
    expect((await acao(transferenciaId, { acao: "nota", texto: "   " })).status).toBe(400);
    expect((await acao(transferenciaId, { acao: "nota", texto: "x".repeat(1001) })).status).toBe(400);
    expect((await acao(transferenciaId, { acao: "nota" })).status).toBe(400);
    sessao.autenticado = false;
    expect((await acao(transferenciaId, { acao: "nota", texto: "oi" })).status).toBe(401);
  });

  it("sem a parte 2 da migração: nota devolve 503 explicando, marcar_lida não quebra e a lista funciona", async () => {
    definirBanco(bancoParte1);
    const { transferenciaId } = await conversa(bancoParte1);
    const r = await acao(transferenciaId, { acao: "nota", texto: "oi" });
    expect(r.status).toBe(503);
    expect((await r.json()).erro).toContain("parte 2");
    expect(await (await acao(transferenciaId, { acao: "marcar_lida" })).json()).toMatchObject({ ok: true, aplicada: false });
    const lista = await (await listarPor()).json();
    expect(lista.migrado).toBe(true);
    expect(lista.itens).toHaveLength(1);
    // Sem como saber o que já foi lido, o indicador some (não conta o histórico inteiro como "novo" para sempre).
    expect(lista.itens[0].nao_lidas).toBe(0);
    expect(lista.nao_lidas).toBe(0);
    expect((await (await detalhe(new Request("http://x"), ctx(transferenciaId))).json()).notas).toBeNull();
  });
});

describe("identidade de quem age", () => {
  it("vale o e-mail da sessão; um 'atendente' digitado no corpo da requisição é IGNORADO", async () => {
    const { transferenciaId } = await conversa(banco);
    await acao(transferenciaId, { acao: "assumir", atendente: "Outra Pessoa Qualquer" });
    const [t] = await banco.sql<{ atendente: string }>("select atendente from wa_transferencias");
    expect(t.atendente).toBe("atendente@teste.com");
    expect((await banco.sql<{ ator: string }>("select ator from auditoria where acao = 'atendimento_assumido'"))[0].ator).toBe("atendente@teste.com");
  });
});

describe("contexto da conversa e modo simulado", () => {
  it("mostra a edição e a reserva relacionadas, o motivo e o telefone MASCARADO", async () => {
    const ed = await criarEdicao(banco, { id: "2099-01-07", artista: "[TESTE] Banda" });
    const mesa = await criarMesa(banco, "T7", 4);
    const { contato } = await conversa(banco, { waId: "5534988887777", contexto: { edicaoId: ed } });
    await banco.sql("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, status, contato_id) values ($1,$2,'[TESTE] Ana','34988887777',2,'QH-987654','confirmada',$3)", [ed, mesa, contato.id]);
    const item = (await (await listarPor()).json()).itens[0];
    expect(item.edicao).toMatchObject({ id: ed, artista: "[TESTE] Banda" });
    expect(item.reserva).toEqual({ codigo: "QH-987654", status: "confirmada", mesa: "T7" });
    expect(item.motivo).toBe("pedido_do_cliente");
    expect(item.contato.telefone).toBe("(34) 9****-7777");
    expect(JSON.stringify(item)).not.toContain("988887777");
  });

  it("envio real desligado (padrão): a lista informa envio_real=false e a resposta do painel volta 'simulado', sem chamar a Meta", async () => {
    const { transferenciaId } = await conversa(banco);
    expect((await (await listarPor()).json()).envio_real).toBe(false);
    await acao(transferenciaId, { acao: "assumir" });
    const r = await (await acao(transferenciaId, { acao: "enviar", texto: "Olá, Ana!" })).json();
    expect(r).toMatchObject({ ok: true, enfileirada: true, simulado: true });
    expect((await banco.sql<{ status: string }>("select status from wa_fila_saida"))[0].status).toBe("pendente");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("máscara de telefone", () => {
  it("mostra só o DDD e os 4 últimos dígitos", () => {
    expect(telefoneMascarado("34999998888")).toBe("(34) 9****-8888");
    expect(telefoneMascarado(null)).toBe("número internacional");
  });
});
