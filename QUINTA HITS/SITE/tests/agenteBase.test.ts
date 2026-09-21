import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { telefoneDoWaId, telefoneParaExibir } from "@/lib/agente/telefone";
import { decidirAgente, decidirEnvio, type ConfigAgente, type Flags } from "@/lib/agente/ativacao";

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});

import {
  aplicarStatusDeEntrega, contarEntradasNaUltimaHora, gravarMensagem, obterConfig, obterOuAbrirConversa, obterOuCriarContato, salvarConversa,
} from "@/lib/agente/repositorio";
import { registrarEventoWebhook } from "@/lib/agente/eventos";

describe("telefoneDoWaId", () => {
  it("celular brasileiro de 11 dígitos, com ou sem o 9 que a Meta às vezes omite", () => {
    expect(telefoneDoWaId("5534999998888")).toBe("34999998888");
    expect(telefoneDoWaId("553499998888")).toBe("34999998888");
    expect(telefoneDoWaId("+55 (34) 99999-8888")).toBe("34999998888");
  });
  it("não brasileiro, fixo ou inválido: null (o agente repassa para uma pessoa)", () => {
    for (const v of ["14155550123", "553432220200", "5534", "abc", "", "5504999998888"]) expect(telefoneDoWaId(v), v).toBeNull();
  });
  it("formata para exibição no painel", () => {
    expect(telefoneParaExibir("34999998888")).toBe("(34) 99999-8888");
    expect(telefoneParaExibir(null)).toBe("número internacional");
  });
});

describe("decidirAgente / decidirEnvio (vale o mais restritivo)", () => {
  const config = (o: Partial<ConfigAgente> = {}): ConfigAgente => ({
    ambiente: "producao", agente_ativo: true, envio_ativo: true, transferencia_humana_ativa: true, pausa_emergencia: false,
    restringir_a_numeros_teste: false, numeros_teste: [], limite_entradas_por_contato_hora: 30, limite_saidas_por_contato_hora: 20, ...o,
  });
  const flags = (o: Partial<Flags> = {}): Flags => ({ envAgente: true, envEnvio: true, ambienteApp: "producao", ...o });
  const WA = "5534999998888";

  it("tudo ligado e sem restrição: atende e envia", () => {
    expect(decidirAgente(flags(), config(), WA)).toEqual({ ativo: true, motivo: "ok" });
    expect(decidirEnvio(flags(), config(), WA)).toEqual({ ativo: true, motivo: "ok" });
  });
  it("variável desligada OU banco desligado: desliga", () => {
    expect(decidirAgente(flags({ envAgente: false }), config(), WA).motivo).toBe("agente_desligado");
    expect(decidirAgente(flags(), config({ agente_ativo: false }), WA).motivo).toBe("agente_desligado");
    expect(decidirEnvio(flags({ envEnvio: false }), config(), WA).ativo).toBe(false);
    expect(decidirEnvio(flags(), config({ envio_ativo: false }), WA).ativo).toBe(false);
  });
  it("agente ligado NÃO liga o envio, e vice-versa: são interruptores independentes", () => {
    expect(decidirAgente(flags({ envEnvio: false }), config({ envio_ativo: false }), WA).ativo).toBe(true);
    expect(decidirEnvio(flags({ envEnvio: false }), config({ envio_ativo: false }), WA).ativo).toBe(false);
  });
  it("pausa de emergência derruba os dois na hora", () => {
    expect(decidirAgente(flags(), config({ pausa_emergencia: true }), WA)).toEqual({ ativo: false, motivo: "pausa_emergencia" });
    expect(decidirEnvio(flags(), config({ pausa_emergencia: true }), WA).ativo).toBe(false);
  });
  it("modo teste: só números da lista recebem resposta e envio; lista vazia = ninguém", () => {
    const restrita = config({ restringir_a_numeros_teste: true, numeros_teste: [WA] });
    expect(decidirAgente(flags(), restrita, WA).ativo).toBe(true);
    expect(decidirAgente(flags(), restrita, "5534988887777")).toEqual({ ativo: false, motivo: "fora_da_lista_de_teste" });
    expect(decidirEnvio(flags(), restrita, "5534988887777").ativo).toBe(false);
    expect(decidirAgente(flags(), config({ restringir_a_numeros_teste: true }), WA).ativo).toBe(false);
  });
  it("ambiente da aplicação diferente do ambiente marcado no banco: tudo desligado", () => {
    expect(decidirAgente(flags({ ambienteApp: "homologacao" }), config(), WA).motivo).toBe("ambiente_divergente");
    expect(decidirEnvio(flags({ ambienteApp: "homologacao" }), config(), WA).motivo).toBe("ambiente_divergente");
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

describe("configuração, contatos e conversas", () => {
  beforeEach(async () => {
    definirBanco(banco);
    await banco.limpar();
  });

  it("obterConfig: a configuração nasce desligada, em modo teste e sem números", async () => {
    expect(await obterConfig()).toMatchObject({ ambiente: "producao", agente_ativo: false, envio_ativo: false, pausa_emergencia: false, restringir_a_numeros_teste: true, numeros_teste: [] });
  });

  it("obterOuCriarContato: cria com telefone normalizado e nome do perfil; o cliente que escreve primeiro tem consentimento", async () => {
    const c = await obterOuCriarContato("553499998888", "Ana");
    expect(c).toMatchObject({ wa_id: "553499998888", telefone: "34999998888", nome: "Ana", bloqueado: false, preferencia_atendimento: "agente" });
    const [linha] = await banco.sql<{ origem: string; consentimento_em: string | null }>("select origem, consentimento_em from wa_contatos");
    expect(linha.origem).toBe("whatsapp_entrada");
    expect(linha.consentimento_em).not.toBeNull();
  });

  it("segunda mensagem reaproveita o contato e atualiza a última interação; nome só é preenchido se estava vazio", async () => {
    const a = await obterOuCriarContato("5534999998888", null);
    const b = await obterOuCriarContato("5534999998888", "Ana");
    expect(b.id).toBe(a.id);
    expect(b.nome).toBe("Ana");
    const c = await obterOuCriarContato("5534999998888", "Outro Nome");
    expect(c.nome).toBe("Ana");
    expect((await banco.sql("select 1 from wa_contatos")).length).toBe(1);
  });

  it("número não brasileiro fica com telefone nulo", async () => {
    expect((await obterOuCriarContato("14155550123", null)).telefone).toBeNull();
  });

  it("dois eventos ao mesmo tempo do mesmo cliente criam UM só contato e UMA só conversa", async () => {
    const contatos = await Promise.all(Array.from({ length: 5 }, () => obterOuCriarContato("5534999998888", "Ana")));
    expect(new Set(contatos.map((c) => c.id)).size).toBe(1);
    const conversas = await Promise.all(Array.from({ length: 5 }, () => obterOuAbrirConversa(contatos[0].id)));
    expect(new Set(conversas.map((c) => c.id)).size).toBe(1);
    expect((await banco.sql("select 1 from wa_conversas")).length).toBe(1);
  });

  it("conversa nasce no agente, em NEW, com contexto vazio; depois de encerrada, uma nova é aberta", async () => {
    const contato = await obterOuCriarContato("5534999998888", null);
    const c1 = await obterOuAbrirConversa(contato.id);
    expect(c1).toMatchObject({ status: "agente", estado: "NEW", contexto: {}, versao: 0, tentativas_sem_entender: 0 });
    await banco.sql("update wa_conversas set status = 'encerrada', encerrada_em = now()");
    const c2 = await obterOuAbrirConversa(contato.id);
    expect(c2.id).not.toBe(c1.id);
    expect((await banco.sql("select 1 from wa_conversas")).length).toBe(2);
  });

  it("salvarConversa: grava e soma a versão; contexto (jsonb) volta como objeto", async () => {
    const contato = await obterOuCriarContato("5534999998888", null);
    const c = await obterOuAbrirConversa(contato.id);
    const nova = await salvarConversa(c, { estado: "ASKING_GUEST_COUNT", contexto: { edicaoId: "2099-01-07", pessoas: 4 } });
    expect(nova).toMatchObject({ versao: 1, estado: "ASKING_GUEST_COUNT", contexto: { edicaoId: "2099-01-07", pessoas: 4 } });
  });

  it("TRAVA OTIMISTA: duas gravações com a mesma versão lida, só a primeira vence e a outra recebe null (sem sobrescrever)", async () => {
    const contato = await obterOuCriarContato("5534999998888", null);
    const lida = await obterOuAbrirConversa(contato.id);
    const [a, b] = await Promise.all([
      salvarConversa(lida, { estado: "SELECTING_EVENT", contexto: { pessoas: 2 } }),
      salvarConversa(lida, { estado: "COLLECTING_NAME", contexto: { pessoas: 9 } }),
    ]);
    expect([a, b].filter((x) => x !== null)).toHaveLength(1);
    const [gravada] = await banco.sql<{ estado: string; versao: number }>("select estado, versao from wa_conversas");
    expect(gravada.versao).toBe(1);
    expect(gravada.estado).toBe(a ? "SELECTING_EVENT" : "COLLECTING_NAME");
  });

  it("gravarMensagem: o mesmo wamid duas vezes vira null (mensagem repetida da Meta)", async () => {
    const contato = await obterOuCriarContato("5534999998888", null);
    const conv = await obterOuAbrirConversa(contato.id);
    const base = { wamid: "wamid.A", conversaId: conv.id, direcao: "entrada" as const, autor: "cliente" as const, tipo: "text", conteudo: "oi", status: "recebida" as const };
    expect(await gravarMensagem(base)).toEqual(expect.any(String));
    expect(await gravarMensagem(base)).toBeNull();
    expect(await gravarMensagem({ ...base, wamid: null, direcao: "saida", autor: "agente", status: "na_fila" })).toEqual(expect.any(String));
    expect(await gravarMensagem({ ...base, wamid: null, direcao: "saida", autor: "agente", status: "na_fila" })).toEqual(expect.any(String));
  });

  it("status de entrega só avança (enviada → entregue → lida) e 'falhou' sempre vale, com o código do erro", async () => {
    const contato = await obterOuCriarContato("5534999998888", null);
    const conv = await obterOuAbrirConversa(contato.id);
    await gravarMensagem({ wamid: "wamid.S", conversaId: conv.id, direcao: "saida", autor: "agente", tipo: "text", conteudo: "x", status: "enviada" });
    const status = async () => (await banco.sql<{ status: string }>("select status from wa_mensagens where wamid = 'wamid.S'"))[0].status;
    await aplicarStatusDeEntrega("wamid.S", "read", null);
    expect(await status()).toBe("lida");
    await aplicarStatusDeEntrega("wamid.S", "delivered", null);
    expect(await status()).toBe("lida");
    await aplicarStatusDeEntrega("wamid.S", "failed", "131047");
    expect(await status()).toBe("falhou");
    expect((await banco.sql<{ erro_codigo: string }>("select erro_codigo from wa_mensagens where wamid = 'wamid.S'"))[0].erro_codigo).toBe("131047");
    await aplicarStatusDeEntrega("wamid.desconhecido", "read", null); // não explode
  });

  it("contarEntradasNaUltimaHora conta só mensagens do cliente dentro da hora", async () => {
    const contato = await obterOuCriarContato("5534999998888", null);
    const conv = await obterOuAbrirConversa(contato.id);
    for (let i = 0; i < 3; i++) await gravarMensagem({ wamid: `wamid.${i}`, conversaId: conv.id, direcao: "entrada", autor: "cliente", tipo: "text", conteudo: "x", status: "recebida" });
    await gravarMensagem({ wamid: null, conversaId: conv.id, direcao: "saida", autor: "agente", tipo: "text", conteudo: "x", status: "na_fila" });
    await banco.sql("update wa_mensagens set criada_em = now() - interval '2 hours' where wamid = 'wamid.0'");
    expect(await contarEntradasNaUltimaHora(conv.id)).toBe(2);
  });
});

describe("idempotência dos eventos do webhook", () => {
  beforeEach(async () => {
    definirBanco(banco);
    await banco.limpar();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("novo, repetido e (sem id) indisponível", async () => {
    const e = { id: "wamid.X", tipo: "message" as const, phoneNumberId: "1352142871312651", destino: "quinta_hits" as const };
    expect(await registrarEventoWebhook(e)).toBe("novo");
    expect(await registrarEventoWebhook(e)).toBe("repetido");
    expect(await registrarEventoWebhook({ ...e, id: "" })).toBe("indisponivel");
  });

  it("dez entregas simultâneas do mesmo evento: exatamente uma é 'nova'", async () => {
    const e = { id: "wamid.Y", tipo: "message" as const, phoneNumberId: "1352142871312651", destino: "quinta_hits" as const };
    const r = await Promise.all(Array.from({ length: 10 }, () => registrarEventoWebhook(e)));
    expect(r.filter((x) => x === "novo")).toHaveLength(1);
    expect(r.filter((x) => x === "repetido")).toHaveLength(9);
  });

  it("a atualização de status usa chave própria (wamid:status) e não colide com a mensagem", async () => {
    const base = { tipo: "status" as const, phoneNumberId: "1352142871312651", destino: "quinta_hits" as const };
    expect(await registrarEventoWebhook({ ...base, id: "wamid.Z:delivered" })).toBe("novo");
    expect(await registrarEventoWebhook({ ...base, id: "wamid.Z:read" })).toBe("novo");
    expect(await registrarEventoWebhook({ ...base, id: "wamid.Z:read" })).toBe("repetido");
  });
});

describe("SEM a migração (produção hoje)", () => {
  beforeEach(async () => {
    definirBanco(bancoAntigo);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  it("obterConfig devolve null e o registro de evento fica 'indisponivel' sem lançar", async () => {
    expect(await obterConfig()).toBeNull();
    expect(await registrarEventoWebhook({ id: "wamid.Q", tipo: "message", phoneNumberId: "1352142871312651", destino: "quinta_hits" })).toBe("indisponivel");
  });
});
