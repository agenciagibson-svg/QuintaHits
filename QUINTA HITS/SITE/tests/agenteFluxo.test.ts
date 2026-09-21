import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { criarEdicao, criarMesa, criarPedidoAguardando, statusDaReserva } from "./helpers/cenarios";
import { ID_OUTRO_NUMERO, ID_QUINTA_HITS, SEGREDO_TESTE, corpoMensagem, corpoStatus, requisicao } from "./helpers/whatsapp";

const tarefas = vi.hoisted(() => ({ fila: [] as (() => Promise<unknown>)[] }));

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});
// O "depois da resposta" do Next não existe fora de uma requisição: os testes guardam a tarefa e a executam quando querem.
vi.mock("@/lib/agente/depois", () => ({ agendarDepois: (fn: () => Promise<unknown>) => { tarefas.fila.push(fn); } }));

import { POST } from "@/app/api/whatsapp/webhook/route";
import { _reiniciarCacheDeCanais } from "@/lib/disponibilidade";
import { assumir, devolverAoAgente, listarAtendimentos } from "@/lib/agente/atendimento";

const WA = "5534999998888";
let banco: BancoTeste;
let bancoAntigo: BancoTeste;
let fetchMock: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  banco = await criarBancoTeste();
  bancoAntigo = await criarBancoTeste({ migracao: false });
});
afterAll(async () => {
  definirBanco(null);
  await banco.pg.close();
  await bancoAntigo.pg.close();
});

/** Edição pronta para o agente: regras completas, liberada, com duas mesas oferecidas ao WhatsApp. */
async function prepararEdicaoPronta() {
  const ed = await criarEdicao(banco, { id: "2099-01-07", horario: "20h", artista: "Jhean Marcell e DJ Leona" });
  const t1 = await criarMesa(banco, "T1", 2);
  const t2 = await criarMesa(banco, "T2", 4);
  await banco.sql(
    `insert into edicoes_regras (edicao_id, abertura, reservas_ate, tolerancia_min, cancelamento_ate_horas, capacidade_maxima, consumacao_minima_centavos, instrucoes_chegada, atendimento_automatico)
     values ($1,'19h','2099-01-07T15:00:00Z',15,24,120,0,'Instruções de teste.',true)`,
    [ed],
  );
  for (const m of [t1, t2]) await banco.sql("insert into edicoes_mesas (edicao_id, mesa_id, disponivel_whatsapp) values ($1,$2,true)", [ed, m]);
  return { ed, t1, t2 };
}

/** Liga o agente para um número de teste (variável + banco + lista), com o envio DESLIGADO. */
async function ligarAgente(numeros: string[] = [WA]) {
  vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true");
  await banco.sql("update wa_config set agente_ativo = true, restringir_a_numeros_teste = true, numeros_teste = $1 where id = 1", [numeros]);
}

async function rodarTarefas() {
  const pendentes = tarefas.fila.splice(0);
  for (const t of pendentes) await t();
}

const enviar = async (o: Parameters<typeof corpoMensagem>[0]) => {
  const r = await POST(requisicao(corpoMensagem({ de: WA, ...o })));
  expect(r.status).toBe(200);
  await rodarTarefas();
};
const toque = (id: string, titulo = id) => ({ interativo: { id, titulo } });
const lista = (id: string, titulo = id) => ({ interativo: { id, titulo, lista: true } });

const fila = () => banco.sql<{ status: string; payload: { mensagem: { tipo: string; corpo: string } }; para: string }>("select status, payload, para from wa_fila_saida order by criada_em, id");
const textosEnfileirados = async () => (await fila()).map((f) => f.payload.mensagem.corpo);
const ultimoCorpo = async () => (await textosEnfileirados()).at(-1) ?? "";
const conversa = async () => (await banco.sql<{ status: string; estado: string; contexto: Record<string, unknown> }>("select status, estado, contexto from wa_conversas order by aberta_em desc limit 1"))[0];

beforeEach(async () => {
  definirBanco(banco);
  _reiniciarCacheDeCanais();
  tarefas.fila.length = 0;
  await banco.limpar();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.SAIDA" }] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("WHATSAPP_APP_SECRET", SEGREDO_TESTE);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("agente desligado: o fluxo atual segue como sempre", () => {
  it("agente desligado por variável: 'oi' recebe a resposta padrão do fluxo do código (com o envio ligado) e NADA é gravado nas tabelas do agente", async () => {
    vi.stubEnv("WHATSAPP_SEND_ENABLED", "true"); vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true"); vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio"); vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_QUINTA_HITS);
    await enviar({ texto: "oi" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).text.body).toMatch(/Este WhatsApp confirma reservas da QUINTA HITS/);
    for (const t of ["wa_contatos", "wa_conversas", "wa_mensagens", "wa_fila_saida"]) expect((await banco.sql(`select 1 from ${t}`)).length, t).toBe(0);
  });

  it("variável ligada mas banco desligado, ou número fora da lista de testes, ou pausa de emergência: continua o fluxo atual", async () => {
    vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true");
    vi.stubEnv("WHATSAPP_SEND_ENABLED", "true"); vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true"); vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio"); vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_QUINTA_HITS);
    await enviar({ texto: "oi", wamid: "wamid.1" }); // banco desligado (agente_ativo = false)
    await banco.sql("update wa_config set agente_ativo = true, restringir_a_numeros_teste = true");
    await enviar({ texto: "oi", wamid: "wamid.2" }); // lista de testes vazia
    await banco.sql("update wa_config set numeros_teste = $1, pausa_emergencia = true", [[WA]]);
    await enviar({ texto: "oi", wamid: "wamid.3" }); // pausa
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((await banco.sql("select 1 from wa_conversas")).length).toBe(0);
  });

  it("agente ligado numa base SEM a migração: cai no fluxo atual, sem quebrar", async () => {
    definirBanco(bancoAntigo);
    vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true");
    vi.stubEnv("WHATSAPP_SEND_ENABLED", "true"); vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true"); vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio"); vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_QUINTA_HITS);
    await enviar({ texto: "oi" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("agente ligado (modo teste): conversa de reserva completa pelo webhook", () => {
  it("do 'oi' à reserva confirmada: grava com origem 'whatsapp_agent', enfileira todas as respostas e NADA sai (envio desligado)", async () => {
    const { ed, t2 } = await prepararEdicaoPronta();
    await ligarAgente();

    await enviar({ texto: "oi" });
    expect((await fila())[0].payload.mensagem.tipo).toBe("botoes");
    expect(await ultimoCorpo()).toContain("Florindos Bar");
    expect((await conversa()).estado).toBe("WELCOME");

    await enviar({ ...toque("reservar", "Reservar mesa") });
    expect(await ultimoCorpo()).toMatch(/Quantas pessoas vão\?/);
    await enviar({ texto: "3" });
    expect((await conversa()).estado).toBe("SELECTING_TABLE");
    expect(await ultimoCorpo()).toContain("Estas mesas estão livres para 3 pessoas");
    await enviar({ ...lista(`mesa:${t2}`, "Mesa T2") });
    await enviar({ texto: "Ana Souza" });
    await enviar({ texto: "Aniversário" });
    expect(await ultimoCorpo()).toContain("Posso confirmar?");
    await enviar({ ...toque("confirmar", "Confirmar") });

    const [r] = await banco.sql<{ status: string; origem_reserva: string; nome: string; observacoes: string; codigo: string; contato_id: string | null; pessoas: number }>("select status, origem_reserva, nome, observacoes, codigo, contato_id, pessoas from reservas");
    expect(r).toMatchObject({ status: "confirmada", origem_reserva: "whatsapp_agent", nome: "Ana Souza", observacoes: "Aniversário", pessoas: 3 });
    expect(r.contato_id).not.toBeNull();
    expect(await ultimoCorpo()).toContain(r.codigo);
    expect(await ultimoCorpo()).toContain("Instruções de teste.");
    expect((await conversa()).estado).toBe("CONFIRMED");

    // envio DESLIGADO: tudo foi para a fila, nada foi enviado, a rede não foi tocada
    const itens = await fila();
    expect(itens).toHaveLength(7); // uma resposta por etapa: boas-vindas, pessoas, mesas, nome, observações, resumo e confirmação
    expect(itens.every((i) => i.status === "pendente")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await banco.sql("select 1 from wa_mensagens where direcao = 'entrada'")).length).toBe(7);
    void ed;
  });

  it("entrega repetida da mesma mensagem (mesmo wamid) é processada UMA só vez", async () => {
    await prepararEdicaoPronta();
    await ligarAgente();
    await enviar({ texto: "oi", wamid: "wamid.IGUAL" });
    const antes = (await fila()).length;
    await enviar({ texto: "oi", wamid: "wamid.IGUAL" });
    await enviar({ texto: "oi", wamid: "wamid.IGUAL" });
    expect((await fila()).length).toBe(antes);
    expect((await banco.sql("select 1 from wa_mensagens where direcao = 'entrada'")).length).toBe(1);
  });

  it("mensagem com código QH-NNNNNN tem PRIORIDADE: o fluxo atual confirma o pedido do site e o agente não responde", async () => {
    const { ed, t1 } = await prepararEdicaoPronta();
    await ligarAgente();
    const id = await criarPedidoAguardando(banco, { edicaoId: ed, mesaId: t1, codigo: "QH-123456", whatsapp: "34999998888" });
    await enviar({ texto: "Quero confirmar minha reserva na QUINTA HITS. Código: QH-123456" });
    expect(await statusDaReserva(banco, id)).toBe("confirmada");
    expect((await fila()).length).toBe(0);
  });

  it("com o envio ligado (variável + banco + lista de testes), a resposta sai depois da resposta à Meta, pelo número da QUINTA HITS", async () => {
    await prepararEdicaoPronta();
    await ligarAgente();
    vi.stubEnv("WHATSAPP_SEND_ENABLED", "true"); vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true"); vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio"); vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_QUINTA_HITS);
    await banco.sql("update wa_config set envio_ativo = true");
    await enviar({ texto: "oi" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://graph.facebook.com/v21.0/${ID_QUINTA_HITS}/messages`);
    expect(JSON.parse(init.body)).toMatchObject({ to: WA, type: "interactive" });
    expect((await fila())[0].status).toBe("enviada");
  });

  it("outro phone_number_id (o 0200): nenhum contato, conversa ou resposta é criado, mesmo com o agente ligado", async () => {
    await prepararEdicaoPronta();
    await ligarAgente();
    await enviar({ phoneNumberId: ID_OUTRO_NUMERO, texto: "quero reservar" });
    for (const t of ["wa_contatos", "wa_conversas", "wa_fila_saida"]) expect((await banco.sql(`select 1 from ${t}`)).length, t).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("edição sem regras completas: o agente NÃO oferece mesa nem confirma; repassa para a equipe", async () => {
    await criarEdicao(banco, { id: "2099-01-07", horario: "20h" });
    await criarMesa(banco, "T1", 4);
    await ligarAgente();
    await enviar({ texto: "quero reservar uma mesa" });
    expect((await conversa()).status).toBe("aguardando_humano");
    expect(await textosEnfileirados()).toEqual(expect.arrayContaining([expect.stringContaining("não consigo confirmar reservas por aqui")]));
    expect((await banco.sql("select motivo from wa_transferencias"))[0]).toEqual({ motivo: "edicao_nao_pronta" });
    expect((await banco.sql("select 1 from reservas")).length).toBe(0);
  });

  it("contato bloqueado é ignorado; número não brasileiro vai para a equipe; excesso de mensagens por hora não gera respostas", async () => {
    await prepararEdicaoPronta();
    await ligarAgente([WA, "14155550123", "5534988887777"]);
    await enviar({ texto: "oi", wamid: "wamid.b1" });
    await banco.sql("update wa_contatos set bloqueado = true");
    const antes = (await fila()).length;
    await enviar({ texto: "oi de novo", wamid: "wamid.b2" });
    expect((await fila()).length).toBe(antes);

    await enviar({ de: "14155550123", texto: "hello", wamid: "wamid.i1" });
    expect((await banco.sql("select motivo from wa_transferencias"))[0]).toEqual({ motivo: "numero_nao_brasileiro" });

    await banco.sql("update wa_config set limite_entradas_por_contato_hora = 2");
    await enviar({ de: "5534988887777", texto: "oi", wamid: "wamid.r1" });
    await enviar({ de: "5534988887777", texto: "reservar", wamid: "wamid.r2" });
    const comDois = (await fila()).length;
    await enviar({ de: "5534988887777", texto: "3", wamid: "wamid.r3" });
    await enviar({ de: "5534988887777", texto: "mesa", wamid: "wamid.r4" });
    expect((await fila()).length).toBe(comDois);
  });

  it("atualizações de status atualizam a mensagem enviada (uma vez cada) e ignoram as repetidas", async () => {
    await prepararEdicaoPronta();
    await ligarAgente();
    await enviar({ texto: "oi" });
    await banco.sql("update wa_mensagens set wamid = 'wamid.SAIDA1', status = 'enviada' where direcao = 'saida'");
    const st = (status: string) => POST(requisicao(corpoStatus({ wamid: "wamid.SAIDA1", status })));
    expect((await st("delivered")).status).toBe(200);
    expect((await banco.sql<{ status: string }>("select status from wa_mensagens where wamid = 'wamid.SAIDA1'"))[0].status).toBe("entregue");
    await st("read"); await st("read");
    expect((await banco.sql<{ status: string }>("select status from wa_mensagens where wamid = 'wamid.SAIDA1'"))[0].status).toBe("lida");
    expect((await banco.sql("select 1 from wa_webhook_eventos where tipo = 'status'")).length).toBe(2);
  });
});

describe("atendimento humano pelo webhook", () => {
  it("cliente pede uma pessoa: entra na fila, o agente fica em SILÊNCIO, o atendente assume, responde e devolve ao agente", async () => {
    await prepararEdicaoPronta();
    await ligarAgente();

    await enviar({ texto: "oi" });
    await enviar({ texto: "quero falar com um atendente" });
    expect(await ultimoCorpo()).toContain("Vou chamar alguém da equipe");
    expect(await conversa()).toMatchObject({ status: "aguardando_humano", estado: "WAITING_HUMAN" });
    let painel = await listarAtendimentos();
    expect(painel?.pendentes).toBe(1);
    expect(painel?.itens[0]).toMatchObject({ motivo: "pedido_do_cliente", status: "aguardando" });
    const transferenciaId = painel!.itens[0].transferencia_id;

    // o cliente escreve de novo: NENHUMA resposta automática compete com a pessoa
    const antes = (await fila()).length;
    await enviar({ texto: "alguém aí?" });
    await enviar({ texto: "por favor" });
    expect((await fila()).length).toBe(antes);
    expect(painel?.itens[0].ultima_mensagem).toBeDefined();
    painel = await listarAtendimentos();
    expect(painel!.itens[0].ultima_mensagem).toBe("por favor");

    expect(await assumir(transferenciaId, "Marcos")).toBe("ok");
    expect((await conversa()).status).toBe("com_humano");
    await enviar({ texto: "obrigado" });
    expect((await fila()).length).toBe(antes);

    expect(await devolverAoAgente(transferenciaId, "Marcos")).toBe("ok");
    expect(await conversa()).toMatchObject({ status: "agente", estado: "WELCOME" });
    await enviar({ texto: "oi" });
    expect((await fila()).length).toBeGreaterThan(antes);
    expect((await banco.sql("select status from wa_transferencias"))[0]).toEqual({ status: "devolvida" });
    // o histórico continua inteiro
    expect((await banco.sql("select 1 from wa_mensagens where direcao = 'entrada'")).length).toBe(6);
  });

  it("pagamento e reclamação também vão para a fila, com o motivo certo", async () => {
    await prepararEdicaoPronta();
    await ligarAgente([WA, "5534988887777"]);
    await enviar({ texto: "quero pagar o sinal no pix" });
    await enviar({ de: "5534988887777", texto: "isso foi péssimo, vou reclamar" });
    const motivos = (await banco.sql<{ motivo: string }>("select motivo from wa_transferencias order by criada_em")).map((m) => m.motivo);
    expect(motivos).toEqual(["pagamento_ou_estorno", "reclamacao"]);
    expect((await listarAtendimentos())?.pendentes).toBe(2);
  });

  it("repasse humano DESLIGADO por variável: avisa que não consegue continuar e encerra, sem prometer atendimento", async () => {
    await prepararEdicaoPronta();
    await ligarAgente();
    vi.stubEnv("WHATSAPP_HUMAN_HANDOFF_ENABLED", "false");
    await enviar({ texto: "quero falar com um atendente" });
    expect(await ultimoCorpo()).toContain("não consigo continuar o atendimento por aqui");
    expect((await banco.sql("select 1 from wa_transferencias")).length).toBe(0);
    expect((await conversa()).status).toBe("encerrada");
  });

  it("depois de encerrada, quando o cliente escreve de novo abre uma conversa nova e o agente responde", async () => {
    await prepararEdicaoPronta();
    await ligarAgente();
    await enviar({ texto: "atendente" });
    const [t] = await banco.sql<{ id: string }>("select id from wa_transferencias");
    const { encerrarAtendimento } = await import("@/lib/agente/atendimento");
    expect(await encerrarAtendimento(t.id, "Marcos")).toBe("ok");
    const antes = (await fila()).length;
    await enviar({ texto: "oi" });
    expect((await banco.sql("select 1 from wa_conversas")).length).toBe(2);
    expect((await fila()).length).toBeGreaterThan(antes);
  });
});
