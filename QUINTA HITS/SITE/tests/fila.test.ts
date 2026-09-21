import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { atrasoDeReenvioSegundos, dentroDaJanela, falhaTemporaria, montarPayloadGraph, sanitizarErro, textoDaMensagem } from "@/lib/agente/graph";
import type { Mensagem } from "@/lib/agente/tipos";
import { ID_QUINTA_HITS, ID_OUTRO_NUMERO } from "./helpers/whatsapp";

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});

import { enfileirar, enviarViaGraph, processarFila, type Enviador } from "@/lib/agente/fila";
import { gravarMensagem, obterOuAbrirConversa, obterOuCriarContato } from "@/lib/agente/repositorio";

const WA = "5534999998888";
const AGORA = new Date("2026-09-21T15:00:00Z");
const texto = (corpo: string): Mensagem => ({ tipo: "texto", corpo });

describe("montagem do payload da Cloud API", () => {
  it("texto, botões e lista no formato da Graph API, respeitando os limites", () => {
    expect(montarPayloadGraph(WA, texto("Olá"))).toMatchObject({ messaging_product: "whatsapp", to: WA, type: "text", text: { body: "Olá" } });
    const b = montarPayloadGraph(WA, { tipo: "botoes", corpo: "Escolha", botoes: [{ id: "a", titulo: "Um título bem comprido demais" }, { id: "b", titulo: "B" }, { id: "c", titulo: "C" }, { id: "d", titulo: "D" }] }) as { interactive: { type: string; action: { buttons: { reply: { title: string } }[] } } };
    expect(b.interactive.type).toBe("button");
    expect(b.interactive.action.buttons).toHaveLength(3);
    expect(b.interactive.action.buttons[0].reply.title.length).toBeLessThanOrEqual(20);
    const itens = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, titulo: `Título muito comprido número ${i}`, descricao: "d".repeat(100) }));
    const l = montarPayloadGraph(WA, { tipo: "lista", corpo: "Escolha", rotuloBotao: "Escolher uma opção agora", itens }) as { interactive: { type: string; action: { button: string; sections: { rows: { title: string; description: string }[] }[] } } };
    expect(l.interactive.type).toBe("list");
    expect(l.interactive.action.sections[0].rows).toHaveLength(10);
    expect(l.interactive.action.button.length).toBeLessThanOrEqual(20);
    expect(l.interactive.action.sections[0].rows[0].title.length).toBeLessThanOrEqual(24);
    expect(l.interactive.action.sections[0].rows[0].description.length).toBeLessThanOrEqual(72);
  });

  it("texto legível para o histórico do atendente", () => {
    expect(textoDaMensagem(texto("oi"))).toBe("oi");
    expect(textoDaMensagem({ tipo: "botoes", corpo: "Escolha", botoes: [{ id: "a", titulo: "Sim" }, { id: "b", titulo: "Não" }] })).toBe("Escolha\n[Sim | Não]");
  });
});

describe("política de reenvio e sanitização", () => {
  it("espera 30 s, 60 s, 2 min... com teto de 1 h, e respeita o retry-after da Meta", () => {
    expect([1, 2, 3, 4, 5].map((n) => atrasoDeReenvioSegundos(n))).toEqual([30, 60, 120, 240, 480]);
    expect(atrasoDeReenvioSegundos(20)).toBe(3600);
    expect(atrasoDeReenvioSegundos(1, 90)).toBe(90);
    expect(atrasoDeReenvioSegundos(3, 10)).toBe(120);
  });
  it("falha temporária: rede, 429 e 5xx; definitiva: demais 4xx", () => {
    for (const s of [0, 429, 500, 502, 503]) expect(falhaTemporaria(s), String(s)).toBe(true);
    for (const s of [400, 401, 403, 404]) expect(falhaTemporaria(s), String(s)).toBe(false);
  });
  it("erro guardado nunca leva token nem telefone", () => {
    const s = sanitizarErro("Falha com Bearer EAAxxxxxxxxxxxxxxxxxxxx para 5534999998888 (token EAAabcdefghijklmnop)");
    expect(s).not.toMatch(/EAA|5534999998888|Bearer EAA/);
    expect(s.length).toBeLessThanOrEqual(300);
    expect(sanitizarErro(undefined)).toBe("");
  });
  it("janela de 24 h", () => {
    expect(dentroDaJanela(new Date(AGORA.getTime() - 23 * 3_600_000).toISOString(), AGORA)).toBe(true);
    expect(dentroDaJanela(new Date(AGORA.getTime() - 25 * 3_600_000).toISOString(), AGORA)).toBe(false);
    expect(dentroDaJanela(null, AGORA)).toBe(false);
  });
});

let banco: BancoTeste;
let bancoAntigo: BancoTeste;
beforeAll(async () => {
  banco = await criarBancoTeste();
  bancoAntigo = await criarBancoTeste({ migracao: false });
});
afterAll(async () => {
  definirBanco(null);
  await banco.pg.close();
  await bancoAntigo.pg.close();
});

const configurar = (sql: string) => banco.sql(`update wa_config set ${sql} where id = 1`);
/** Tudo ligado, sem restrição de teste: para exercitar o caminho de envio. */
const ligarTudo = () => configurar("agente_ativo = true, envio_ativo = true, restringir_a_numeros_teste = false");

async function prepararItem(o: { conteudo?: string; para?: string; ultimaMsgHa?: number } = {}) {
  const contato = await obterOuCriarContato(o.para ?? WA, null);
  const conversa = await obterOuAbrirConversa(contato.id);
  const horas = o.ultimaMsgHa ?? 1;
  await banco.sql("update wa_conversas set ultima_msg_cliente_em = $1 where id = $2", [new Date(AGORA.getTime() - horas * 3_600_000).toISOString(), conversa.id]);
  const mensagemId = await gravarMensagem({ conversaId: conversa.id, direcao: "saida", autor: "agente", tipo: "text", conteudo: o.conteudo ?? "Olá!", status: "na_fila" });
  const r = await enfileirar({ conversaId: conversa.id, mensagemId, para: o.para ?? WA, mensagem: texto(o.conteudo ?? "Olá!"), chave: `k-${Math.random()}` });
  const [item] = await banco.sql<{ id: string }>("select id from wa_fila_saida order by criada_em desc limit 1");
  // O relógio dos testes é fixo (AGORA); o item precisa já estar vencido em relação a ele.
  await banco.sql("update wa_fila_saida set proxima_tentativa_em = $1 where id = $2", [new Date(AGORA.getTime() - 60_000).toISOString(), item.id]);
  return { conversa, mensagemId: mensagemId!, itemId: item.id, r };
}

const statusDoItem = async (id: string) => (await banco.sql<{ status: string; tentativas: number; erro_codigo: string | null }>("select status, tentativas, erro_codigo from wa_fila_saida where id = $1", [id]))[0];

describe("fila de saída", () => {
  beforeEach(async () => {
    definirBanco(banco);
    await banco.limpar();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  it("enfileirar é idempotente: a mesma chave não gera dois envios", async () => {
    const { conversa } = await prepararItem();
    const a = await enfileirar({ conversaId: conversa.id, mensagemId: null, para: WA, mensagem: texto("x"), chave: "mesma" });
    const b = await enfileirar({ conversaId: conversa.id, mensagemId: null, para: WA, mensagem: texto("x"), chave: "mesma" });
    expect([a, b]).toEqual(["nova", "repetida"]);
    expect((await banco.sql("select 1 from wa_fila_saida where chave_idempotencia = 'mesma'")).length).toBe(1);
  });

  describe("ENVIO DESLIGADO (padrão): nada sai", () => {
    it("configuração de fábrica: nenhum envio, o item fica pendente e a rede não é tocada", async () => {
      const { itemId } = await prepararItem();
      const enviador = vi.fn<Enviador>();
      const r = await processarFila({ agora: AGORA, enviador });
      expect(r).toMatchObject({ enviadas: 0, bloqueadas: 1 });
      expect(enviador).not.toHaveBeenCalled();
      expect(await statusDoItem(itemId)).toMatchObject({ status: "pendente", tentativas: 0 });
    });

    it("envio pelo banco ligado, mas a VARIÁVEL desligada: continua bloqueado", async () => {
      await ligarTudo();
      const { itemId } = await prepararItem();
      const enviador = vi.fn<Enviador>();
      expect((await processarFila({ agora: AGORA, enviador })).bloqueadas).toBe(1);
      expect(enviador).not.toHaveBeenCalled();
      expect((await statusDoItem(itemId)).status).toBe("pendente");
    });

    it("variável ligada, mas o BANCO desligado: continua bloqueado", async () => {
      vi.stubEnv("WHATSAPP_SEND_ENABLED", "true");
      await configurar("envio_ativo = false, restringir_a_numeros_teste = false");
      await prepararItem();
      const enviador = vi.fn<Enviador>();
      expect((await processarFila({ agora: AGORA, enviador })).bloqueadas).toBe(1);
      expect(enviador).not.toHaveBeenCalled();
    });

    it("pausa de emergência bloqueia mesmo com tudo ligado", async () => {
      vi.stubEnv("WHATSAPP_SEND_ENABLED", "true");
      await ligarTudo();
      await configurar("pausa_emergencia = true");
      await prepararItem();
      const enviador = vi.fn<Enviador>();
      expect((await processarFila({ agora: AGORA, enviador })).bloqueadas).toBe(1);
      expect(enviador).not.toHaveBeenCalled();
    });

    it("sem a migração aplicada, a fila responde 'semMigracao' sem lançar", async () => {
      definirBanco(bancoAntigo);
      expect((await processarFila({ agora: AGORA })).semMigracao).toBe(true);
    });
  });

  describe("envio permitido (simulado)", () => {
    beforeEach(async () => {
      vi.stubEnv("WHATSAPP_SEND_ENABLED", "true");
      await ligarTudo();
    });

    it("envia, guarda o wamid na mensagem, registra a tentativa e apaga o texto do payload da fila", async () => {
      const { itemId, mensagemId } = await prepararItem({ conteudo: "Sua reserva está confirmada" });
      const enviador = vi.fn<Enviador>(async () => ({ ok: true, wamid: "wamid.OUT1" }));
      expect(await processarFila({ agora: AGORA, enviador })).toMatchObject({ enviadas: 1 });
      expect(enviador).toHaveBeenCalledWith(WA, expect.objectContaining({ type: "text", to: WA }));
      expect(await statusDoItem(itemId)).toMatchObject({ status: "enviada", tentativas: 1 });
      expect((await banco.sql<{ wamid: string; status: string }>("select wamid, status from wa_mensagens where id = $1", [mensagemId]))[0]).toEqual({ wamid: "wamid.OUT1", status: "enviada" });
      const [t] = await banco.sql<{ numero: number; http_status: number }>("select numero, http_status from wa_fila_tentativas");
      expect(t).toEqual({ numero: 1, http_status: 200 });
      expect(JSON.stringify((await banco.sql<{ payload: unknown }>("select payload from wa_fila_saida"))[0])).not.toContain("confirmada");
    });

    it("modo teste: só a lista de números recebe; o resto é CANCELADO sem enviar", async () => {
      await configurar("restringir_a_numeros_teste = true, numeros_teste = '{}'");
      await banco.sql("update wa_config set numeros_teste = $1 where id = 1", [[WA]]);
      const permitido = await prepararItem({ para: WA });
      const negado = await prepararItem({ para: "5534988887777" });
      const enviador = vi.fn<Enviador>(async () => ({ ok: true, wamid: "wamid.T" }));
      const r = await processarFila({ agora: AGORA, enviador });
      expect(r).toMatchObject({ enviadas: 1, canceladas: 1 });
      expect(enviador).toHaveBeenCalledTimes(1);
      expect((await statusDoItem(permitido.itemId)).status).toBe("enviada");
      expect(await statusDoItem(negado.itemId)).toMatchObject({ status: "cancelada", erro_codigo: "fora_da_lista_de_teste" });
    });

    it("429: reagenda respeitando o retry-after; depois envia com sucesso", async () => {
      const { itemId } = await prepararItem();
      const enviador = vi.fn<Enviador>().mockResolvedValueOnce({ ok: false, httpStatus: 429, codigo: "130429", retryAfterS: 90 }).mockResolvedValue({ ok: true, wamid: "wamid.OK" });
      expect(await processarFila({ agora: AGORA, enviador })).toMatchObject({ reagendadas: 1, enviadas: 0 });
      const [antes] = await banco.sql<{ status: string; tentativas: number; proxima_tentativa_em: string }>("select status, tentativas, proxima_tentativa_em from wa_fila_saida where id = $1", [itemId]);
      expect(antes).toMatchObject({ status: "pendente", tentativas: 1 });
      expect(new Date(antes.proxima_tentativa_em).getTime() - AGORA.getTime()).toBe(90_000);
      // antes do prazo: não tenta
      expect((await processarFila({ agora: new Date(AGORA.getTime() + 60_000), enviador })).enviadas).toBe(0);
      expect(enviador).toHaveBeenCalledTimes(1);
      // depois do prazo: envia
      expect((await processarFila({ agora: new Date(AGORA.getTime() + 91_000), enviador })).enviadas).toBe(1);
      expect((await statusDoItem(itemId)).status).toBe("enviada");
    });

    it("falha de rede e 5xx: tenta de novo com espera crescente; ao esgotar as tentativas vai para o dead-letter ('morta')", async () => {
      const { itemId } = await prepararItem();
      await banco.sql("update wa_fila_saida set max_tentativas = 3 where id = $1", [itemId]);
      const enviador = vi.fn<Enviador>(async () => ({ ok: false, httpStatus: 503, codigo: "5xx", detalhe: "Bearer EAAsecretsecretsecret para 5534999998888" }));
      let agora = AGORA;
      const esperas: number[] = [];
      for (let i = 0; i < 3; i++) {
        await processarFila({ agora, enviador });
        const [linha] = await banco.sql<{ status: string; proxima_tentativa_em: string }>("select status, proxima_tentativa_em from wa_fila_saida where id = $1", [itemId]);
        if (linha.status === "pendente") { esperas.push((new Date(linha.proxima_tentativa_em).getTime() - agora.getTime()) / 1000); agora = new Date(linha.proxima_tentativa_em); }
      }
      expect(esperas).toEqual([30, 60]);
      expect(await statusDoItem(itemId)).toMatchObject({ status: "morta", tentativas: 3 });
      const guardado = JSON.stringify(await banco.sql("select erro_detalhe from wa_fila_saida union all select erro_detalhe from wa_fila_tentativas"));
      expect(guardado).not.toMatch(/EAAsecret|5534999998888/);
    });

    it("erro definitivo (4xx): não repete, marca a fila e a mensagem como falha, com o código", async () => {
      const { itemId, mensagemId } = await prepararItem();
      const enviador = vi.fn<Enviador>(async () => ({ ok: false, httpStatus: 400, codigo: "131047", detalhe: "Re-engagement message" }));
      expect(await processarFila({ agora: AGORA, enviador })).toMatchObject({ falhas: 1 });
      expect(await statusDoItem(itemId)).toMatchObject({ status: "falhou", tentativas: 1, erro_codigo: "131047" });
      expect((await banco.sql<{ status: string; erro_codigo: string }>("select status, erro_codigo from wa_mensagens where id = $1", [mensagemId]))[0]).toEqual({ status: "falhou", erro_codigo: "131047" });
      await processarFila({ agora: new Date(AGORA.getTime() + 3_600_000), enviador });
      expect(enviador).toHaveBeenCalledTimes(1);
    });

    it("fora da janela de 24 h: não envia (só template aprovado) e registra a falha", async () => {
      const { itemId } = await prepararItem({ ultimaMsgHa: 25 });
      const enviador = vi.fn<Enviador>();
      expect(await processarFila({ agora: AGORA, enviador })).toMatchObject({ falhas: 1 });
      expect(enviador).not.toHaveBeenCalled();
      expect(await statusDoItem(itemId)).toMatchObject({ status: "falhou", erro_codigo: "fora_da_janela_24h" });
    });

    it("limite de saídas por contato na hora: o excedente é ADIADO, não enviado", async () => {
      await configurar("limite_saidas_por_contato_hora = 2");
      const itens = [];
      for (let i = 0; i < 3; i++) itens.push(await prepararItem({ conteudo: `m${i}` }));
      const enviador = vi.fn<Enviador>(async () => ({ ok: true, wamid: `wamid.${Math.random()}` }));
      const r = await processarFila({ agora: AGORA, enviador });
      expect(r.enviadas).toBe(2);
      expect(r.adiadas).toBe(1);
      expect(enviador).toHaveBeenCalledTimes(2);
    });

    it("trava vencida (processo que caiu no meio): o item volta para a fila e é enviado", async () => {
      const { itemId } = await prepararItem();
      await banco.sql("update wa_fila_saida set status = 'enviando', travado_ate = $2 where id = $1", [itemId, new Date(AGORA.getTime() - 1000).toISOString()]);
      const enviador = vi.fn<Enviador>(async () => ({ ok: true, wamid: "wamid.R" }));
      expect((await processarFila({ agora: AGORA, enviador })).enviadas).toBe(1);
    });

    it("dois processadores ao mesmo tempo: o item é enviado UMA só vez", async () => {
      await prepararItem();
      const enviador = vi.fn<Enviador>(async () => ({ ok: true, wamid: "wamid.U" }));
      const [a, b] = await Promise.all([processarFila({ agora: AGORA, enviador }), processarFila({ agora: AGORA, enviador })]);
      expect(a.enviadas + b.enviadas).toBe(1);
      expect(enviador).toHaveBeenCalledTimes(1);
    });
  });

  describe("envio real pela Graph API (fetch simulado)", () => {
    const corpo = { messaging_product: "whatsapp", to: WA, type: "text", text: { body: "x" } };
    beforeEach(() => {
      vi.stubEnv("WHATSAPP_SEND_ENABLED", "true");
      vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio-de-teste");
      vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_QUINTA_HITS);
    });

    it("chama o número da QUINTA HITS na versão configurada, com Bearer, e devolve o wamid", async () => {
      vi.stubEnv("META_GRAPH_API_VERSION", "v23.0");
      const f = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.G1" }] }), { status: 200 }));
      vi.stubGlobal("fetch", f);
      expect(await enviarViaGraph(WA, corpo)).toEqual({ ok: true, wamid: "wamid.G1" });
      const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
      expect(url).toBe(`https://graph.facebook.com/v23.0/${ID_QUINTA_HITS}/messages`);
      expect(init.headers.Authorization).toBe("Bearer token-ficticio-de-teste");
    });

    it("appsecret_proof só entra quando pedido, e é o HMAC do token", async () => {
      vi.stubEnv("META_APP_SECRET_PROOF_ENABLED", "true");
      vi.stubEnv("WHATSAPP_APP_SECRET", "segredo-ficticio");
      const f = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "w" }] }), { status: 200 }));
      vi.stubGlobal("fetch", f);
      await enviarViaGraph(WA, corpo);
      expect((f.mock.calls[0] as unknown as [string])[0]).toMatch(/\/messages\?appsecret_proof=[0-9a-f]{64}$/);
    });

    it("número de envio diferente do da QUINTA HITS (ex.: o 0200) ou envio desligado: NÃO chama a rede", async () => {
      const f = vi.fn();
      vi.stubGlobal("fetch", f);
      vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_OUTRO_NUMERO);
      expect(await enviarViaGraph(WA, corpo)).toMatchObject({ ok: false, codigo: "envio_nao_configurado" });
      vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_QUINTA_HITS);
      vi.stubEnv("WHATSAPP_SEND_ENABLED", "false");
      expect(await enviarViaGraph(WA, corpo)).toMatchObject({ ok: false });
      expect(f).not.toHaveBeenCalled();
    });

    it("erro da Meta vira falha com o código; falha de rede vira status 0 (temporária)", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 131047, message: "Re-engagement" } }), { status: 400 })));
      expect(await enviarViaGraph(WA, corpo)).toMatchObject({ ok: false, httpStatus: 400, codigo: "131047" });
      vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
      expect(await enviarViaGraph(WA, corpo)).toMatchObject({ ok: false, httpStatus: 0, codigo: "rede" });
    });

    it("pela fila, com o número de envio errado o item NÃO é enviado e fica pendente", async () => {
      vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_OUTRO_NUMERO);
      await ligarTudo();
      const { itemId } = await prepararItem();
      const f = vi.fn();
      vi.stubGlobal("fetch", f);
      expect((await processarFila({ agora: AGORA })).bloqueadas).toBe(1);
      expect(f).not.toHaveBeenCalled();
      expect((await statusDoItem(itemId)).status).toBe("pendente");
    });
  });
});
