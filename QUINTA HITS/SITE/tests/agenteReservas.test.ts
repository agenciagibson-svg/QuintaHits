import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { criarEdicao, criarMesa } from "./helpers/cenarios";

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});

import { _reiniciarCacheDeCanais } from "@/lib/disponibilidade";
import { obterOuCriarContato, type Contato } from "@/lib/agente/repositorio";
import { atualizarReservaDoContato, cancelarReservaDoContato, criarReservaDoAgente, reservasDoContato } from "@/lib/agente/reservas";
import { POST as postSite } from "@/app/api/reservas/route";

let banco: BancoTeste;
beforeAll(async () => { banco = await criarBancoTeste(); });
afterAll(async () => { definirBanco(null); await banco.pg.close(); });

const ED = "2099-01-07";

/** Edição com regras completas, liberada para o agente, com as mesas informadas oferecidas ao WhatsApp. */
async function edicaoPronta(mesas: { id: string; whatsapp?: boolean; site?: boolean }[], id = ED, cancelamentoHoras: number | null = 24) {
  await criarEdicao(banco, { id, horario: "20h" });
  await banco.sql(
    `insert into edicoes_regras (edicao_id, abertura, reservas_ate, tolerancia_min, cancelamento_ate_horas, capacidade_maxima, consumacao_minima_centavos, instrucoes_chegada, atendimento_automatico)
     values ($1,'19h','2099-01-07T15:00:00Z',15,$2,120,0,'Instruções de teste.',true) on conflict (edicao_id) do nothing`,
    [id, cancelamentoHoras],
  );
  for (const m of mesas) {
    await banco.sql("insert into edicoes_mesas (edicao_id, mesa_id, disponivel_whatsapp, disponivel_site) values ($1,$2,$3,$4) on conflict (edicao_id, mesa_id) do nothing", [id, m.id, m.whatsapp ?? true, m.site ?? true]);
  }
  return id;
}

const reservas = () => banco.sql<{ status: string; origem_reserva: string; nome: string; codigo: string; whatsapp: string; contato_id: string | null }>("select status, origem_reserva, nome, codigo, whatsapp, contato_id from reservas order by created_at");

describe("reservas feitas pelo agente", () => {
  let contato: Contato;
  beforeEach(async () => {
    definirBanco(banco);
    _reiniciarCacheDeCanais();
    await banco.limpar();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    contato = await obterOuCriarContato("5534999998888", "Ana");
  });

  it("cria a reserva já CONFIRMADA, na mesma tabela do site, com origem 'whatsapp_agent', código e vínculo ao contato", async () => {
    const t1 = await criarMesa(banco, "T1", 4);
    await edicaoPronta([{ id: t1 }]);
    const r = await criarReservaDoAgente({ contato, edicaoId: ED, mesaId: t1, pessoas: 3, nome: "Ana Souza", observacoes: "Aniversário" });
    expect(r).toMatchObject({ ok: true, mesaNumero: "T1" });
    expect(r.ok && r.codigo).toMatch(/^QH-\d{6}$/);
    const [linha] = await reservas();
    expect(linha).toMatchObject({ status: "confirmada", origem_reserva: "whatsapp_agent", nome: "Ana Souza", whatsapp: "34999998888", contato_id: contato.id });
    const [aud] = await banco.sql<{ acao: string; detalhe: unknown }>("select acao, detalhe from auditoria");
    expect(aud.acao).toBe("reserva_criada");
    expect(JSON.stringify(aud.detalhe)).not.toContain("Ana");
  });

  it("recusa por motivo, sem gravar nada: edição não pronta, mesa que o WhatsApp não oferece, grupo maior que a mesa, edição inexistente", async () => {
    const t1 = await criarMesa(banco, "T1", 4);
    await criarEdicao(banco, { id: ED, horario: "20h" }); // sem regras
    expect(await criarReservaDoAgente({ contato, edicaoId: ED, mesaId: t1, pessoas: 2, nome: "Ana", observacoes: "" })).toEqual({ ok: false, motivo: "nao_pronta" });

    // edição cuja ÚNICA mesa não é oferecida ao WhatsApp nem chega a ficar pronta
    await edicaoPronta([{ id: t1, whatsapp: false }]);
    expect(await criarReservaDoAgente({ contato, edicaoId: ED, mesaId: t1, pessoas: 2, nome: "Ana", observacoes: "" })).toEqual({ ok: false, motivo: "nao_pronta" });
    // com outra mesa liberada a edição fica pronta, e a mesa que o WhatsApp não oferece continua recusada
    const t2 = await criarMesa(banco, "T2", 4);
    await banco.sql("insert into edicoes_mesas (edicao_id, mesa_id, disponivel_whatsapp) values ($1,$2,true)", [ED, t2]);
    expect(await criarReservaDoAgente({ contato, edicaoId: ED, mesaId: t1, pessoas: 2, nome: "Ana", observacoes: "" })).toEqual({ ok: false, motivo: "mesa_indisponivel" });

    await banco.sql("update edicoes_mesas set disponivel_whatsapp = true where mesa_id = $1", [t1]);
    expect(await criarReservaDoAgente({ contato, edicaoId: ED, mesaId: t1, pessoas: 9, nome: "Ana", observacoes: "" })).toEqual({ ok: false, motivo: "mesa_indisponivel" });
    expect(await criarReservaDoAgente({ contato, edicaoId: "2098-05-05", mesaId: t1, pessoas: 2, nome: "Ana", observacoes: "" })).toEqual({ ok: false, motivo: "edicao_fechada" });
    expect((await reservas()).length).toBe(0);
  });

  it("contato sem telefone brasileiro (internacional): não reserva", async () => {
    const t1 = await criarMesa(banco, "T1", 4);
    await edicaoPronta([{ id: t1 }]);
    const estrangeiro = await obterOuCriarContato("14155550123", null);
    expect(await criarReservaDoAgente({ contato: estrangeiro, edicaoId: ED, mesaId: t1, pessoas: 2, nome: "John", observacoes: "" })).toEqual({ ok: false, motivo: "erro" });
  });

  it("limite de reservas ativas por WhatsApp na mesma edição (o mesmo do site)", async () => {
    const mesas = [await criarMesa(banco, "T1", 4), await criarMesa(banco, "T2", 4), await criarMesa(banco, "T3", 4)];
    await edicaoPronta(mesas.map((id) => ({ id })));
    const r = [];
    for (const m of mesas) r.push(await criarReservaDoAgente({ contato, edicaoId: ED, mesaId: m, pessoas: 2, nome: "Ana", observacoes: "" }));
    expect(r.map((x) => (x.ok ? "ok" : x.motivo))).toEqual(["ok", "ok", "limite_por_whatsapp"]);
  });

  it("mesa já segurada por reserva do SITE: 'mesa_indisponivel'", async () => {
    const t1 = await criarMesa(banco, "T1", 4);
    await edicaoPronta([{ id: t1 }]);
    await banco.sql("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, expira_em) values ($1,$2,'[TESTE]','34988887777',2,'QH-999999', now() + interval '15 minutes')", [ED, t1]);
    expect(await criarReservaDoAgente({ contato, edicaoId: ED, mesaId: t1, pessoas: 2, nome: "Ana", observacoes: "" })).toEqual({ ok: false, motivo: "mesa_indisponivel" });
  });
});

describe("CORRIDA entre canais pela mesma mesa (estoque único)", () => {
  beforeEach(async () => {
    definirBanco(banco);
    _reiniciarCacheDeCanais();
    await banco.limpar();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "chave-ficticia");
    vi.stubEnv("WHATSAPP_NUMERO_CASA", "5534991167064");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1352142871312651");
    vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio");
    vi.stubEnv("WHATSAPP_APP_SECRET", "segredo-ficticio");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
  });

  const site = (mesaId: string, telefone: string) =>
    postSite(new Request("http://localhost/api/reservas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nome: "Cliente Site", whatsapp: telefone, pessoas: 2, edicao_id: ED, mesa_id: mesaId, turnstile: "ok" }) }));

  it("SITE e WHATSAPP tentam a MESMA mesa ao mesmo tempo: só uma operação é aceita, em qualquer ordem de chegada", async () => {
    for (let rodada = 0; rodada < 6; rodada++) {
      await banco.limpar();
      _reiniciarCacheDeCanais();
      const mesa = await criarMesa(banco, "T1", 4);
      await edicaoPronta([{ id: mesa }]);
      const contato = await obterOuCriarContato("5534999998888", "Ana");
      const operacoes = [() => site(mesa, "(34) 98888-7777"), () => criarReservaDoAgente({ contato, edicaoId: ED, mesaId: mesa, pessoas: 2, nome: "Ana", observacoes: "" })];
      if (rodada % 2) operacoes.reverse();
      const resultados = await Promise.all(operacoes.map((op) => op()));
      const aceitas = resultados.filter((r) => (r instanceof Response ? r.status === 201 : r.ok)).length;
      expect(aceitas, `rodada ${rodada}`).toBe(1);
      expect((await banco.sql("select 1 from reservas")).length).toBe(1);
    }
  });

  it("várias tentativas dos dois canais na mesma mesa: exatamente UMA reserva existe no fim", async () => {
    const mesa = await criarMesa(banco, "T1", 4);
    await edicaoPronta([{ id: mesa }]);
    const contatos = await Promise.all(["5534911110001", "5534911110002", "5534911110003"].map((w) => obterOuCriarContato(w, null)));
    const tentativas = [
      ...contatos.map((c) => criarReservaDoAgente({ contato: c, edicaoId: ED, mesaId: mesa, pessoas: 2, nome: "Whats", observacoes: "" })),
      ...["(34) 97777-0001", "(34) 97777-0002", "(34) 97777-0003"].map((t) => site(mesa, t)),
    ];
    const r = await Promise.all(tentativas);
    expect(r.filter((x) => (x instanceof Response ? x.status === 201 : x.ok))).toHaveLength(1);
    expect((await banco.sql("select 1 from reservas where status in ('aguardando','confirmada')")).length).toBe(1);
  });

  it("primeiro o SITE reserva, depois o WhatsApp tenta: recusado; ao cancelar, a mesa volta e o WhatsApp consegue", async () => {
    const mesa = await criarMesa(banco, "T1", 4);
    await edicaoPronta([{ id: mesa }]);
    const contato = await obterOuCriarContato("5534999998888", "Ana");
    expect((await site(mesa, "(34) 98888-7777")).status).toBe(201);
    expect(await criarReservaDoAgente({ contato, edicaoId: ED, mesaId: mesa, pessoas: 2, nome: "Ana", observacoes: "" })).toEqual({ ok: false, motivo: "mesa_indisponivel" });
    await banco.sql("update reservas set status = 'cancelada'");
    expect((await criarReservaDoAgente({ contato, edicaoId: ED, mesaId: mesa, pessoas: 2, nome: "Ana", observacoes: "" })).ok).toBe(true);
  });

  it("primeiro o WhatsApp reserva, depois o SITE tenta a mesma mesa: 409", async () => {
    const mesa = await criarMesa(banco, "T1", 4);
    await edicaoPronta([{ id: mesa }]);
    const contato = await obterOuCriarContato("5534999998888", "Ana");
    expect((await criarReservaDoAgente({ contato, edicaoId: ED, mesaId: mesa, pessoas: 2, nome: "Ana", observacoes: "" })).ok).toBe(true);
    expect((await site(mesa, "(34) 98888-7777")).status).toBe(409);
  });
});

describe("minhas reservas, cancelamento e alteração (do próprio número)", () => {
  let contato: Contato;
  let t1: string;
  beforeEach(async () => {
    definirBanco(banco);
    _reiniciarCacheDeCanais();
    await banco.limpar();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    contato = await obterOuCriarContato("5534999998888", "Ana");
    t1 = await criarMesa(banco, "T1", 4);
    await edicaoPronta([{ id: t1 }]);
  });
  const criar = async () => {
    const r = await criarReservaDoAgente({ contato, edicaoId: ED, mesaId: t1, pessoas: 2, nome: "Ana", observacoes: "" });
    if (!r.ok) throw new Error("fixture");
    return (await banco.sql<{ id: string }>("select id from reservas where codigo = $1", [r.codigo]))[0].id;
  };

  it("lista as reservas ativas e futuras do número (do site e do agente), e nada de outros números", async () => {
    await criar();
    const outra = await criarMesa(banco, "T2", 4);
    await banco.sql("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, codigo, expira_em) values ($1,$2,'Outro','34988887777',2,'QH-888888', now() + interval '15 minutes')", [ED, outra]);
    await banco.sql("insert into edicoes (id, data, horario, local, status) values ('2000-01-06','2000-01-06','20h','Florindos Bar','realizada')");
    const mesaPassada = await criarMesa(banco, "T3", 4);
    await banco.sql("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, status, codigo) values ('2000-01-06',$1,'Passada','34999998888',2,'confirmada','QH-777777')", [mesaPassada]);
    const lista = await reservasDoContato(contato);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ edicaoId: ED, mesaNumero: "T1", pessoas: 2, status: "confirmada" });
  });

  it("cancela dentro do prazo cadastrado e a mesa volta ao estoque", async () => {
    const id = await criar();
    expect(await cancelarReservaDoContato(contato, id)).toBe("ok");
    expect((await reservas())[0].status).toBe("cancelada");
    expect((await banco.sql("select 1 from auditoria where acao = 'reserva_cancelada'")).length).toBe(1);
  });

  it("fora do prazo de cancelamento: não cancela ('fora_do_prazo') e a reserva permanece", async () => {
    const id = await criar();
    const duasHorasAntes = new Date("2099-01-07T21:00:00Z"); // o evento é às 20h (23:00Z); prazo de 24 h já venceu
    expect(await cancelarReservaDoContato(contato, id, duasHorasAntes)).toBe("fora_do_prazo");
    expect((await reservas())[0].status).toBe("confirmada");
  });

  it("prazo de cancelamento não cadastrado: 'regra_indefinida', quem decide é uma pessoa", async () => {
    const id = await criar();
    await banco.sql("update edicoes_regras set cancelamento_ate_horas = null");
    expect(await cancelarReservaDoContato(contato, id)).toBe("regra_indefinida");
  });

  it("só o dono do WhatsApp cancela ou altera a própria reserva", async () => {
    const id = await criar();
    const intruso = await obterOuCriarContato("5534988887777", "Outra");
    expect(await cancelarReservaDoContato(intruso, id)).toBe("nao_encontrada");
    expect(await atualizarReservaDoContato(intruso, id, { nome: "Invasor" })).toBe(false);
    expect((await reservas())[0]).toMatchObject({ status: "confirmada", nome: "Ana" });
  });

  it("altera nome e observações (sem mexer no estoque) e registra auditoria sem os valores", async () => {
    const id = await criar();
    expect(await atualizarReservaDoContato(contato, id, { nome: "Ana Paula", observacoes: "Sem glúten" })).toBe(true);
    expect((await banco.sql<{ nome: string; observacoes: string }>("select nome, observacoes from reservas where id = $1", [id]))[0]).toEqual({ nome: "Ana Paula", observacoes: "Sem glúten" });
    const [aud] = await banco.sql<{ detalhe: unknown }>("select detalhe from auditoria where acao = 'reserva_atualizada'");
    expect(JSON.stringify(aud.detalhe)).toContain("nome");
    expect(JSON.stringify(aud.detalhe)).not.toContain("Sem glúten");
  });
});
