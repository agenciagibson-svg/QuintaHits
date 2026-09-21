import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { criarEdicao, criarMesa } from "./helpers/cenarios";
import { SEGREDO_TESTE, corpoMensagem, requisicao } from "./helpers/whatsapp";

/**
 * DEMONSTRAÇÃO EM MODO SIMULADO. Passa pelo pipeline real (webhook → agente → banco → fila), com o envio DESLIGADO:
 * nada sai para a Meta. Para ver a conversa impressa:   DEMO_AGENTE=1 npx vitest run tests/demonstracao.test.ts
 * Sem a variável, roda em silêncio e só confere o resultado.
 */
const tarefas = vi.hoisted(() => ({ fila: [] as (() => Promise<unknown>)[] }));
vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});
vi.mock("@/lib/agente/depois", () => ({ agendarDepois: (fn: () => Promise<unknown>) => { tarefas.fila.push(fn); } }));

import { POST } from "@/app/api/whatsapp/webhook/route";
import { _reiniciarCacheDeCanais } from "@/lib/disponibilidade";
import { assumir, devolverAoAgente, enviarComoAtendente, listarAtendimentos } from "@/lib/agente/atendimento";

const MOSTRAR = process.env.DEMO_AGENTE === "1";
const saida = (linha = "") => { if (MOSTRAR) process.stdout.write(`${linha}\n`); };

const WA = "5534999998888";
let banco: BancoTeste;
beforeAll(async () => { banco = await criarBancoTeste(); definirBanco(banco); });
afterAll(async () => { definirBanco(null); await banco.pg.close(); });

type Linha = { direcao: string; autor: string; conteudo: string; status: string };
let jaMostradas = 0;
const mostrarNovas = async () => {
  const todas = await banco.sql<Linha>("select direcao, autor, conteudo, status from wa_mensagens order by criada_em, direcao");
  for (const m of todas.slice(jaMostradas)) {
    const [corpo, ...resto] = m.conteudo.split("\n[");
    const opcoes = resto.length ? `\n         [${resto.join("\n[")}` : "";
    saida(m.direcao === "entrada" ? `  Cliente  › ${m.conteudo}` : `  ${m.autor === "atendente" ? "Atendente" : "Agente  "} › ${corpo.split("\n").join("\n             ")}${opcoes}   (${m.status})`);
  }
  jaMostradas = todas.length;
};
const enviar = async (o: Parameters<typeof corpoMensagem>[0]) => {
  expect((await POST(requisicao(corpoMensagem({ de: WA, ...o })))).status).toBe(200);
  for (const t of tarefas.fila.splice(0)) await t();
  await mostrarNovas();
};
const toque = (id: string, titulo: string) => ({ interativo: { id, titulo }, texto: titulo });

beforeEach(async () => {
  await banco.limpar();
  _reiniciarCacheDeCanais();
  jaMostradas = 0;
  tarefas.fila.length = 0;
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("REDE BLOQUEADA: a demonstração não envia nada"); }));
  vi.stubEnv("WHATSAPP_APP_SECRET", SEGREDO_TESTE);
  vi.stubEnv("WHATSAPP_AGENT_ENABLED", "true");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  const ed = await criarEdicao(banco, { id: "2099-01-08", horario: "20h", artista: "Artista de Teste e DJ Teste" });
  const mesas = [await criarMesa(banco, "T1", 2, "Salão"), await criarMesa(banco, "T2", 4, "Salão"), await criarMesa(banco, "T3", 6, "Varanda")];
  await banco.sql(
    `insert into edicoes_regras (edicao_id, abertura, reservas_ate, tolerancia_min, cancelamento_ate_horas, capacidade_maxima, consumacao_minima_centavos, instrucoes_chegada, atendimento_automatico)
     values ($1,'19h','2099-01-08T15:00:00Z',15,24,120,5000,'FICTÍCIO: instruções de chegada de teste.',true)`, [ed]);
  for (const m of mesas) await banco.sql("insert into edicoes_mesas (edicao_id, mesa_id, disponivel_whatsapp) values ($1,$2,true)", [ed, m]);
  await banco.sql("update wa_config set agente_ativo = true, restringir_a_numeros_teste = true, numeros_teste = $1 where id = 1", [[WA]]);
});

describe("demonstração (modo simulado, envio desligado)", () => {
  it("FLUXO DE RESERVA: do primeiro 'oi' à reserva confirmada", async () => {
    saida("\n══ DEMONSTRAÇÃO 1 — reserva pelo WhatsApp (modo simulado; dados fictícios) ══\n");
    await enviar({ texto: "oi" });
    await enviar(toque("reservar", "Reservar mesa"));
    await enviar({ texto: "4" });
    const [t3] = await banco.sql<{ id: string }>("select id from mesas where numero = 'T3'");
    await enviar({ interativo: { id: `mesa:${t3.id}`, titulo: "Mesa T3", lista: true }, texto: "Mesa T3" });
    await enviar({ texto: "Ana Souza" });
    await enviar({ texto: "Aniversário de uma amiga" });
    await enviar(toque("confirmar", "Confirmar"));

    const fila = await banco.sql<{ status: string }>("select status from wa_fila_saida");
    const [reserva] = await banco.sql<{ status: string; origem_reserva: string; pessoas: number; codigo: string }>("select status, origem_reserva, pessoas, codigo from reservas");
    saida("\n  ── Resultado no banco ──");
    saida(`  reserva: ${reserva.codigo} · status=${reserva.status} · origem=${reserva.origem_reserva} · ${reserva.pessoas} pessoas`);
    saida(`  fila de saída: ${fila.length} mensagens, todas "${fila[0].status}" (envio desligado: nenhuma saiu para a Meta)\n`);
    expect(reserva).toMatchObject({ status: "confirmada", origem_reserva: "whatsapp_agent", pessoas: 4 });
    expect(fila.every((f) => f.status === "pendente")).toBe(true);
  });

  it("TRANSFERÊNCIA PARA HUMANO: agente para de responder, atendente assume, responde e devolve", async () => {
    saida("\n══ DEMONSTRAÇÃO 2 — transferência para atendimento humano (modo simulado) ══\n");
    await enviar({ texto: "oi" });
    await enviar({ texto: "quero falar com um atendente" });

    let painel = await listarAtendimentos();
    saida("\n  ── Painel: fila \"Aguardando atendimento humano\" ──");
    saida(`  contador: ${painel!.pendentes} aguardando · motivo: ${painel!.itens[0].motivo} · cliente: ${painel!.itens[0].contato.nome || "(sem nome)"} ${painel!.itens[0].contato.telefone}\n`);

    saida("  ── O cliente escreve de novo enquanto espera: o agente NÃO responde ──");
    const antes = (await banco.sql("select 1 from wa_fila_saida")).length;
    await enviar({ texto: "alguém aí?" });
    expect((await banco.sql("select 1 from wa_fila_saida")).length).toBe(antes);
    saida("  (nenhuma resposta automática foi enfileirada)\n");

    const id = painel!.itens[0].transferencia_id;
    saida("  ── Atendente 'Marcos' assume e responde pelo painel ──");
    expect(await assumir(id, "Marcos")).toBe("ok");
    expect(await enviarComoAtendente(id, "Marcos", "Oi! Aqui é o Marcos, da equipe da QUINTA HITS. Como posso ajudar?")).toBe("enfileirada");
    await mostrarNovas();

    saida("\n  ── Atendente devolve a conversa ao agente ──");
    expect(await devolverAoAgente(id, "Marcos")).toBe("ok");
    await enviar({ texto: "oi" });
    painel = await listarAtendimentos();
    saida(`\n  fila de atendimento agora: ${painel!.itens.length} aberto(s)\n`);
    expect(painel!.itens).toHaveLength(0);
    expect((await banco.sql("select 1 from wa_fila_saida where status <> 'pendente'")).length).toBe(0);
  });
});
