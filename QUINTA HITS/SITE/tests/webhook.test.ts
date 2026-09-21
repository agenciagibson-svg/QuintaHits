import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { criarEdicao, criarMesa, criarPedidoAguardando, statusDaReserva } from "./helpers/cenarios";
import { ID_OUTRO_NUMERO, ID_QUINTA_HITS, SEGREDO_TESTE, corpoMensagem, corpoStatus, requisicao } from "./helpers/whatsapp";

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});

import { GET, POST } from "@/app/api/whatsapp/webhook/route";

let banco: BancoTeste;
beforeAll(async () => {
  banco = await criarBancoTeste();
  definirBanco(banco);
});
afterAll(async () => {
  definirBanco(null);
  await banco.pg.close();
});

let fetchMock: ReturnType<typeof vi.fn>;
let edicaoId: string;
let mesaId: string;

beforeEach(async () => {
  await banco.limpar();
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("WHATSAPP_APP_SECRET", SEGREDO_TESTE);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  edicaoId = await criarEdicao(banco);
  mesaId = await criarMesa(banco, "T1", 4);
});

/** Liga o envio como em produção: variável + token fictício + ID do número da QUINTA HITS. */
const ligarEnvio = () => {
  vi.stubEnv("WHATSAPP_SEND_ENABLED", "true"); vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true");
  vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio-de-teste");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_QUINTA_HITS);
};
const textoEnviado = () => JSON.parse(fetchMock.mock.calls[0][1].body as string).text.body as string;

describe("GET — verificação da Meta (inalterada)", () => {
  const url = (q: string) => new Request(`http://localhost/api/whatsapp/webhook?${q}`);

  it("devolve o challenge com o token certo", async () => {
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "texto-combinado");
    const r = await GET(url("hub.mode=subscribe&hub.verify_token=texto-combinado&hub.challenge=12345"));
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("12345");
  });

  it("403 com token errado, sem token configurado ou modo errado", async () => {
    expect((await GET(url("hub.mode=subscribe&hub.verify_token=x&hub.challenge=1"))).status).toBe(403);
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "texto-combinado");
    expect((await GET(url("hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1"))).status).toBe(403);
    expect((await GET(url("hub.mode=unsubscribe&hub.verify_token=texto-combinado&hub.challenge=1"))).status).toBe(403);
  });
});

describe("POST — assinatura (inalterada)", () => {
  it("401 sem assinatura, com assinatura errada ou sem o segredo do app; nada é processado", async () => {
    const id = await criarPedidoAguardando(banco, { edicaoId, mesaId });
    const corpo = corpoMensagem({ texto: "Código: QH-123456" });
    expect((await POST(requisicao(corpo, null))).status).toBe(401);
    expect((await POST(requisicao(corpo, "sha256=00"))).status).toBe(401);
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    expect((await POST(requisicao(corpo))).status).toBe(401);
    expect(await statusDaReserva(banco, id)).toBe("aguardando");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("corpo que não é JSON, mas com assinatura válida: 200 e nada acontece", async () => {
    expect((await POST(requisicao("isto não é json"))).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Fluxo atual QH-NNNNNN — número da QUINTA HITS (preservado)", () => {
  it("o mesmo número que fez o pedido confirma a reserva com o código", async () => {
    const id = await criarPedidoAguardando(banco, { edicaoId, mesaId, codigo: "QH-123456" });
    const r = await POST(requisicao(corpoMensagem({ texto: "Quero confirmar minha reserva na QUINTA HITS. Código: QH-123456" })));
    expect(r.status).toBe(200);
    expect(await statusDaReserva(banco, id)).toBe("confirmada");
  });

  it("aceita o código em minúsculas e sem hífen", async () => {
    const id = await criarPedidoAguardando(banco, { edicaoId, mesaId, codigo: "QH-654321" });
    await POST(requisicao(corpoMensagem({ texto: "qh654321" })));
    expect(await statusDaReserva(banco, id)).toBe("confirmada");
  });

  it("com o envio DESLIGADO (padrão): confirma no banco e NÃO chama a Meta", async () => {
    const id = await criarPedidoAguardando(banco, { edicaoId, mesaId });
    await POST(requisicao(corpoMensagem({ texto: "QH-123456" })));
    expect(await statusDaReserva(banco, id)).toBe("confirmada");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("com o envio LIGADO: responde pelo número da QUINTA HITS, no Florindos Bar, sem citar outra casa", async () => {
    ligarEnvio();
    await criarPedidoAguardando(banco, { edicaoId, mesaId });
    await POST(requisicao(corpoMensagem({ texto: "QH-123456" })));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://graph.facebook.com/v21.0/${ID_QUINTA_HITS}/messages`);
    expect(init.headers.Authorization).toBe("Bearer token-ficticio-de-teste");
    expect(textoEnviado()).toMatch(/Reserva confirmada! Mesa T1 para 2 pessoas/);
    expect(textoEnviado()).toContain("Florindos Bar");
    expect(textoEnviado()).not.toMatch(/tatu/i);
  });

  it("mensagem repetida pela Meta não confirma duas vezes", async () => {
    ligarEnvio();
    const id = await criarPedidoAguardando(banco, { edicaoId, mesaId });
    const corpo = corpoMensagem({ texto: "QH-123456", wamid: "wamid.igual" });
    await POST(requisicao(corpo));
    const [antes] = await banco.sql<{ confirmada_em: string }>("select confirmada_em from reservas where id = $1", [id]);
    await POST(requisicao(corpo));
    const [depois] = await banco.sql<{ confirmada_em: string }>("select confirmada_em from reservas where id = $1", [id]);
    expect(depois.confirmada_em).toBe(antes.confirmada_em);
    const hist = await banco.sql("select 1 from reservas_historico where reserva_id = $1 and status_novo = 'confirmada'", [id]);
    expect(hist.length).toBe(1);
  });

  it("número diferente do informado no site NÃO confirma", async () => {
    ligarEnvio();
    const id = await criarPedidoAguardando(banco, { edicaoId, mesaId, whatsapp: "34999998888" });
    await POST(requisicao(corpoMensagem({ de: "5534988887777", texto: "QH-123456" })));
    expect(await statusDaReserva(banco, id)).toBe("aguardando");
    expect(textoEnviado()).toMatch(/outro número de WhatsApp/);
  });

  it("código inexistente: avisa; texto sem código: resposta padrão do fluxo atual", async () => {
    ligarEnvio();
    await POST(requisicao(corpoMensagem({ texto: "QH-999999" })));
    expect(textoEnviado()).toMatch(/Não encontramos o código QH-999999/);
    fetchMock.mockClear();
    await POST(requisicao(corpoMensagem({ texto: "oi, tudo bem?" })));
    expect(textoEnviado()).toMatch(/Este WhatsApp confirma reservas da QUINTA HITS/);
  });

  it("pedido vencido e mesa já pega por outra pessoa: não confirma e avisa que a mesa foi liberada", async () => {
    ligarEnvio();
    const vencido = await criarPedidoAguardando(banco, { edicaoId, mesaId, codigo: "QH-111111", expiraEmMin: -5 });
    // A expiração é "preguiçosa": só depois dela outra pessoa consegue pedir a mesma mesa (como no POST /api/reservas).
    await banco.sql("update reservas set status = 'expirada' where id = $1", [vencido]);
    await criarPedidoAguardando(banco, { edicaoId, mesaId, codigo: "QH-222222", whatsapp: "34988887777" });
    await POST(requisicao(corpoMensagem({ texto: "QH-111111", timestamp: Math.floor(Date.now() / 1000) })));
    expect(await statusDaReserva(banco, vencido)).toBe("expirada");
    expect(textoEnviado()).toMatch(/foi liberada/);
  });

  it("figurinha, imagem e atualização de status do número da QUINTA HITS: 200 e nenhum efeito", async () => {
    ligarEnvio();
    const id = await criarPedidoAguardando(banco, { edicaoId, mesaId });
    expect((await POST(requisicao(corpoMensagem({ tipo: "image" })))).status).toBe(200);
    expect((await POST(requisicao(corpoStatus({ status: "delivered" })))).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await statusDaReserva(banco, id)).toBe("aguardando");
  });
});

describe("Isolamento do número final 0200 e de qualquer outro ID", () => {
  it("mensagem de OUTRO phone_number_id com código válido e remetente certo: 200, NÃO confirma e NÃO responde", async () => {
    ligarEnvio();
    const id = await criarPedidoAguardando(banco, { edicaoId, mesaId, codigo: "QH-123456" });
    const r = await POST(requisicao(corpoMensagem({ phoneNumberId: ID_OUTRO_NUMERO, texto: "QH-123456" })));
    expect(r.status).toBe(200);
    expect(await statusDaReserva(banco, id)).toBe("aguardando");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("outro número escrevendo 'oi': 200 e NENHUMA resposta automática", async () => {
    ligarEnvio();
    const r = await POST(requisicao(corpoMensagem({ phoneNumberId: ID_OUTRO_NUMERO, texto: "oi" })));
    expect(r.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("evento sem phone_number_id: 200, ignorado, sem resposta", async () => {
    ligarEnvio();
    const id = await criarPedidoAguardando(banco, { edicaoId, mesaId });
    expect((await POST(requisicao(corpoMensagem({ phoneNumberId: null, texto: "QH-123456" })))).status).toBe(200);
    expect(await statusDaReserva(banco, id)).toBe("aguardando");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("atualização de status de outro número também é só ignorada", async () => {
    expect((await POST(requisicao(corpoStatus({ phoneNumberId: ID_OUTRO_NUMERO })))).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("callback com eventos dos DOIS números: só o da QUINTA HITS é tratado", async () => {
    ligarEnvio();
    const meu = await criarPedidoAguardando(banco, { edicaoId, mesaId, codigo: "QH-111111", whatsapp: "34999998888" });
    const mesa2 = await criarMesa(banco, "T2", 4);
    const outro = await criarPedidoAguardando(banco, { edicaoId, mesaId: mesa2, codigo: "QH-222222", whatsapp: "34988887777" });
    const corpo = JSON.stringify({
      entry: [
        { changes: [{ value: { metadata: { phone_number_id: ID_OUTRO_NUMERO }, messages: [{ from: "5534988887777", id: "wamid.o", type: "text", text: { body: "QH-222222" } }] } }] },
        { changes: [{ value: { metadata: { phone_number_id: ID_QUINTA_HITS }, messages: [{ from: "5534999998888", id: "wamid.m", type: "text", text: { body: "QH-111111" } }] } }] },
      ],
    });
    expect((await POST(requisicao(corpo))).status).toBe(200);
    expect(await statusDaReserva(banco, meu)).toBe("confirmada");
    expect(await statusDaReserva(banco, outro)).toBe("aguardando");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("SEM o agente ligado, evento de outro número só gera log: nada é gravado no banco", async () => {
    await POST(requisicao(corpoMensagem({ phoneNumberId: ID_OUTRO_NUMERO, wamid: "wamid.x" })));
    expect((await banco.sql("select 1 from wa_webhook_eventos")).length).toBe(0);
  });

  it("COM o agente ligado por variável, o evento de outro número é registrado SEM conteúdo e SEM telefone, uma vez só", async () => {
    vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true");
    const corpo = corpoMensagem({ phoneNumberId: ID_OUTRO_NUMERO, wamid: "wamid.y", texto: "segredo do cliente", de: "5534977776666" });
    await POST(requisicao(corpo));
    await POST(requisicao(corpo));
    const linhas = await banco.sql<Record<string, unknown>>("select * from wa_webhook_eventos");
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ id: "wamid.y", tipo: "message", phone_number_id: ID_OUTRO_NUMERO, destino: "ignorado_outro_numero" });
    const bruto = JSON.stringify(linhas);
    expect(bruto).not.toContain("segredo do cliente");
    expect(bruto).not.toContain("5534977776666");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("nunca envia por um número que não seja o da QUINTA HITS: variável apontando para outro ID bloqueia o envio", async () => {
    ligarEnvio();
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", ID_OUTRO_NUMERO);
    const id = await criarPedidoAguardando(banco, { edicaoId, mesaId });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await POST(requisicao(corpoMensagem({ texto: "QH-123456" })));
    expect(await statusDaReserva(banco, id)).toBe("confirmada");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Homologação: o número de TESTE vale no lugar do oficial", () => {
  it("com APP_AMBIENTE=homologacao, o ID de teste é tratado e o ID de produção passa a ser 'outro número'", async () => {
    vi.stubEnv("APP_AMBIENTE", "homologacao");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1029384756");
    vi.stubEnv("WHATSAPP_SEND_ENABLED", "true"); vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true");
    vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio-de-teste");
    const id = await criarPedidoAguardando(banco, { edicaoId, mesaId });

    await POST(requisicao(corpoMensagem({ phoneNumberId: ID_QUINTA_HITS, texto: "QH-123456" })));
    expect(await statusDaReserva(banco, id)).toBe("aguardando");

    await POST(requisicao(corpoMensagem({ phoneNumberId: "1029384756", texto: "QH-123456" })));
    expect(await statusDaReserva(banco, id)).toBe("confirmada");
    expect(fetchMock.mock.calls[0][0]).toContain("/1029384756/messages");
  });

  it("homologação sem ID de teste configurado: NADA é tratado", async () => {
    vi.stubEnv("APP_AMBIENTE", "homologacao");
    const id = await criarPedidoAguardando(banco, { edicaoId, mesaId });
    await POST(requisicao(corpoMensagem({ phoneNumberId: ID_QUINTA_HITS, texto: "QH-123456" })));
    expect(await statusDaReserva(banco, id)).toBe("aguardando");
  });
});
