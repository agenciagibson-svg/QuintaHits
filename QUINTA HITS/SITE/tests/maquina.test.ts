import { describe, expect, it } from "vitest";
import { avancar, normalizar } from "@/lib/agente/maquina";
import * as T from "@/lib/agente/textos";
import { REGRAS_VAZIAS, type RegrasEdicao } from "@/lib/regrasEdicao";
import type {
  ConversaParaMaquina, EdicaoOferecida, EntradaCliente, EstadoConversa, Mensagem, MesaOferecida, Passo, Portas,
  ReservaResumo, ResultadoCancelamento, ResultadoCriacao,
} from "@/lib/agente/tipos";

const AGORA = new Date("2026-09-21T15:00:00Z");

const regras = (o: Partial<RegrasEdicao> = {}): RegrasEdicao => ({
  ...REGRAS_VAZIAS, abertura: "19h", reservas_ate: "2099-01-07T15:00:00.000Z", tolerancia_min: 15, cancelamento_ate_horas: 24,
  capacidade_maxima: 120, consumacao_minima_centavos: 5000, instrucoes_chegada: "Instruções de chegada de teste.", atendimento_automatico: true, ...o,
});
const edicao = (id = "2099-01-07", o: Partial<EdicaoOferecida> = {}): EdicaoOferecida => ({ id, data: id, artista: "Jhean Marcell e DJ Leona", horario: "20h", regras: regras(), ...o });
const mesa = (numero: string, lugares: number, area = "Salão"): MesaOferecida => ({ id: `id-${numero}`, numero, lugares, area });
const reserva = (o: Partial<ReservaResumo> = {}): ReservaResumo => ({ id: "r1", codigo: "QH-111111", edicaoId: "2099-01-07", data: "2099-01-07", horario: "20h", mesaNumero: "T1", pessoas: 2, nome: "Ana", observacoes: "", status: "confirmada", ...o });

type Config = { edicoes?: EdicaoOferecida[]; mesas?: MesaOferecida[]; ocupadas?: string[]; reservas?: ReservaResumo[]; criar?: ResultadoCriacao; cancelar?: ResultadoCancelamento; atualizarOk?: boolean };

/** Portas em memória: registram o que foi chamado. */
function portasFake(c: Config = {}) {
  const chamadas = { criar: [] as unknown[], cancelar: [] as string[], atualizar: [] as unknown[], mesasLivres: [] as unknown[] };
  const ocupadas = new Set(c.ocupadas ?? []);
  const portas: Portas = {
    agora: () => AGORA,
    edicoesProntas: async () => c.edicoes ?? [edicao()],
    mesasLivres: async (edicaoId, pessoas) => {
      chamadas.mesasLivres.push({ edicaoId, pessoas });
      return (c.mesas ?? [mesa("T1", 2), mesa("T2", 4), mesa("T3", 4), mesa("T4", 8)]).filter((m) => !ocupadas.has(m.id) && m.lugares >= pessoas);
    },
    criarReserva: async (p) => { chamadas.criar.push(p); return c.criar ?? { ok: true, codigo: "QH-482193", mesaNumero: "T2" }; },
    reservasDoContato: async () => c.reservas ?? [],
    cancelarReserva: async (id) => { chamadas.cancelar.push(id); return c.cancelar ?? "ok"; },
    atualizarReserva: async (id, campos) => { chamadas.atualizar.push({ id, campos }); return c.atualizarOk ?? true; },
  };
  return { portas, chamadas, ocupadas };
}

type Toque = { id: string; texto?: string };
const paraEntrada = (e: string | Toque | null): EntradaCliente => (e === null ? { forma: "nao_suportado" } : typeof e === "string" ? { forma: "texto", texto: e } : { forma: "interativa", id: e.id, texto: e.texto ?? e.id });

/** Conduz uma conversa passo a passo, carregando estado, contexto e tentativas como o orquestrador faz. */
async function conversar(portas: Portas, entradas: (string | Toque | null)[], inicial: Partial<ConversaParaMaquina> = {}) {
  let conv: ConversaParaMaquina = { estado: "NEW", contexto: {}, tentativasSemEntender: 0, atualizadoEm: AGORA.toISOString(), ...inicial };
  const passos: Passo[] = [];
  for (const e of entradas) {
    const p = await avancar(conv, paraEntrada(e), portas);
    passos.push(p);
    conv = { estado: p.estado, contexto: p.contexto, tentativasSemEntender: p.tentativasSemEntender, atualizadoEm: AGORA.toISOString() };
  }
  return { passos, ultimo: passos[passos.length - 1], todasAsMensagens: passos.flatMap((p) => p.mensagens) };
}

const corpo = (m: Mensagem) => m.corpo;
const todoTexto = (ms: Mensagem[]) => ms.map((m) => `${m.corpo} ${m.tipo === "botoes" ? m.botoes.map((b) => b.titulo).join(" ") : m.tipo === "lista" ? m.itens.map((i) => `${i.titulo} ${i.descricao ?? ""}`).join(" ") : ""}`).join("\n");

describe("normalizar", () => {
  it("minúsculas, sem acento, espaços e pontuação final aparados", () => {
    expect(normalizar("  Quero  Falar com ATENDENTE!!  ")).toBe("quero falar com atendente");
    expect(normalizar("Reclamação.")).toBe("reclamacao");
  });
});

describe("primeiro contato e menu", () => {
  it("'oi' de contato novo: boas-vindas com os 3 botões do menu, no Florindos Bar", async () => {
    const { portas } = portasFake();
    const { ultimo } = await conversar(portas, ["oi"]);
    expect(ultimo.estado).toBe("WELCOME");
    const m = ultimo.mensagens[0];
    expect(m.tipo).toBe("botoes");
    expect(corpo(m)).toContain("QUINTA HITS");
    expect(corpo(m)).toContain("Florindos Bar");
    expect(m.tipo === "botoes" && m.botoes.map((b) => b.id)).toEqual(["reservar", "minhas", "humano"]);
  });

  it("'quero reservar' logo na primeira mensagem: saúda e já pergunta quantas pessoas (uma edição pronta)", async () => {
    const { portas } = portasFake();
    const { ultimo } = await conversar(portas, ["quero reservar uma mesa"]);
    expect(ultimo.estado).toBe("ASKING_GUEST_COUNT");
    expect(ultimo.mensagens).toHaveLength(2);
    expect(corpo(ultimo.mensagens[1])).toMatch(/Quantas pessoas vão\?/);
    expect(corpo(ultimo.mensagens[1])).toContain("evento às 20h");
    expect(ultimo.contexto.edicaoId).toBe("2099-01-07");
  });

  it("com várias edições prontas, oferece a lista; responde por toque, pelo número ou pela data", async () => {
    const eds = [edicao("2099-01-07"), edicao("2099-01-14", { artista: "Cibele e DJ Jabá" })];
    for (const escolha of [{ id: "ed:2099-01-14" }, "2", "14/01"] as (string | Toque)[]) {
      const { portas } = portasFake({ edicoes: eds });
      const { passos } = await conversar(portas, ["quero reservar", escolha]);
      expect(passos[0].estado).toBe("SELECTING_EVENT");
      expect(passos[0].mensagens.at(-1)?.tipo).toBe("lista");
      expect(passos[1].estado, JSON.stringify(escolha)).toBe("ASKING_GUEST_COUNT");
      expect(passos[1].contexto.edicaoId).toBe("2099-01-14");
    }
  });

  it("menu, voltar e recomeçar levam ao menu de qualquer etapa", async () => {
    for (const palavra of ["menu", "voltar", "recomeçar"]) {
      const { portas } = portasFake();
      const { ultimo } = await conversar(portas, ["quero reservar", "4", palavra]);
      expect(ultimo.estado, palavra).toBe("WELCOME");
      expect(ultimo.contexto).toEqual({});
    }
  });

  it("'cancelar' no meio do pedido desiste do pedido e volta ao menu, sem reservar nada", async () => {
    const { portas, chamadas } = portasFake();
    const { ultimo } = await conversar(portas, ["quero reservar", "4", "cancelar"]);
    expect(ultimo.estado).toBe("WELCOME");
    expect(corpo(ultimo.mensagens[0])).toContain("não fiz nenhuma reserva");
    expect(chamadas.criar).toHaveLength(0);
  });
});

describe("fluxo de reserva completo", () => {
  it("do primeiro 'oi' à confirmação: grava UMA vez, com os dados certos, e só então confirma com o código", async () => {
    const { portas, chamadas } = portasFake();
    const { passos } = await conversar(portas, [
      "oi", { id: "reservar", texto: "Reservar mesa" }, "4", { id: "mesa:id-T2" }, "Ana Souza", "Aniversário da minha irmã", { id: "confirmar" },
    ]);
    expect(passos.map((p) => p.estado)).toEqual(["WELCOME", "ASKING_GUEST_COUNT", "SELECTING_TABLE", "COLLECTING_NAME", "COLLECTING_NOTES", "REVIEWING_RESERVATION", "CONFIRMED"]);

    // a lista mostrou só mesas com 4+ lugares, pela disponibilidade das portas
    expect(chamadas.mesasLivres[0]).toEqual({ edicaoId: "2099-01-07", pessoas: 4 });
    const lista = passos[2].mensagens[0];
    expect(lista.tipo === "lista" && lista.itens.map((i) => i.titulo)).toEqual(["Mesa T2", "Mesa T3", "Mesa T4"]);

    // o resumo mostra só as regras cadastradas e o local certo
    const resumo = corpo(passos[5].mensagens[0]);
    expect(resumo).toContain("Mesa T2 (4 lugares)");
    expect(resumo).toContain("4 pessoas");
    expect(resumo).toContain("Em nome de: Ana Souza");
    expect(resumo).toContain("Observações: Aniversário da minha irmã");
    expect(resumo).toContain("Florindos Bar");
    expect(resumo).toContain("Tolerância de 15 minutos.");
    expect(resumo).toContain("Consumação mínima: R$ 50,00.");
    expect(resumo).toContain("Cancelamento até 24 horas antes.");

    // gravou uma vez, com os dados certos
    expect(chamadas.criar).toEqual([{ edicaoId: "2099-01-07", mesaId: "id-T2", pessoas: 4, nome: "Ana Souza", observacoes: "Aniversário da minha irmã" }]);
    const final = corpo(passos[6].mensagens[0]);
    expect(final).toContain("QH-482193");
    expect(final).toContain("Instruções de chegada de teste.");
    expect(final).toContain("Se é quinta, tem Hits.");
    expect(passos[6].contexto).toEqual({});
  });

  it("NÃO confirma ao cliente se a gravação falhou: nenhuma mensagem de 'Reserva confirmada' sem o código do banco", async () => {
    for (const criar of [{ ok: false, motivo: "erro" }, { ok: false, motivo: "limite_por_whatsapp" }, { ok: false, motivo: "edicao_fechada" }, { ok: false, motivo: "nao_pronta" }] as ResultadoCriacao[]) {
      const { portas } = portasFake({ criar });
      const { todasAsMensagens, ultimo } = await conversar(portas, ["reservar", "2", { id: "mesa:id-T1" }, "Ana", "não", { id: "confirmar" }]);
      expect(todoTexto(todasAsMensagens), JSON.stringify(criar)).not.toContain("Reserva confirmada");
      expect(ultimo.estado).toBe("WAITING_HUMAN");
      expect(ultimo.transferir).toBeDefined();
    }
  });

  it("mesa tomada no instante de confirmar: avisa e mostra as que restam; não confirma", async () => {
    const { portas, ocupadas } = portasFake({ criar: { ok: false, motivo: "mesa_indisponivel" } });
    const { passos } = await conversar(portas, ["reservar", "2", { id: "mesa:id-T1" }, "Ana", "não"]);
    ocupadas.add("id-T1");
    const p = await avancar({ estado: "REVIEWING_RESERVATION", contexto: passos[4].contexto, tentativasSemEntender: 0, atualizadoEm: AGORA.toISOString() }, { forma: "interativa", id: "confirmar", texto: "Confirmar" }, portas);
    expect(p.estado).toBe("SELECTING_TABLE");
    expect(corpo(p.mensagens[0])).toContain("acabou de ser reservada");
    expect(p.mensagens[1].tipo).toBe("lista");
    expect(todoTexto(p.mensagens)).not.toContain("Mesa T1");
  });

  it("mesa escolhida foi reservada por outra pessoa DURANTE a conversa: avisa e refaz a lista", async () => {
    const { portas, ocupadas } = portasFake();
    const { passos } = await conversar(portas, ["reservar", "2"]);
    ocupadas.add("id-T2");
    const p = await avancar({ estado: "SELECTING_TABLE", contexto: passos[1].contexto, tentativasSemEntender: 0, atualizadoEm: AGORA.toISOString() }, { forma: "interativa", id: "mesa:id-T2", texto: "Mesa T2" }, portas);
    expect(p.estado).toBe("SELECTING_TABLE");
    expect(corpo(p.mensagens[0])).toContain("acabou de ser reservada");
    expect(todoTexto(p.mensagens.slice(1))).not.toContain("Mesa T2");
  });

  it("sem mesa livre para o grupo: oferece outra data ou a equipe, sem inventar mesa", async () => {
    const { portas } = portasFake({ mesas: [mesa("T1", 2)] });
    const { ultimo } = await conversar(portas, ["reservar", "10"]);
    expect(ultimo.estado).toBe("WELCOME");
    const m = ultimo.mensagens[0];
    expect(corpo(m)).toContain("Não encontrei mesa livre para 10 pessoas");
    expect(m.tipo === "botoes" && m.botoes.map((b) => b.id)).toEqual(["reservar", "humano"]);
  });

  it("aceita 'quatro pessoas', 'somos 6' e 'para 3'; recusa 0, 51 e texto sem número", async () => {
    for (const [dito, esperado] of [["quatro pessoas", 4], ["somos 6", 6], ["para 3", 3], ["dez", 10], ["7", 7]] as const) {
      const { portas, chamadas } = portasFake({ mesas: [mesa("T1", 50)] });
      await conversar(portas, ["reservar", dito]);
      expect((chamadas.mesasLivres[0] as { pessoas: number }).pessoas, dito).toBe(esperado);
    }
    for (const ruim of ["0", "51", "muitas", "abc"]) {
      const { portas, chamadas } = portasFake();
      const { ultimo } = await conversar(portas, ["reservar", ruim]);
      expect(ultimo.estado, ruim).toBe("ASKING_GUEST_COUNT");
      expect(ultimo.tentativasSemEntender).toBe(1);
      expect(chamadas.mesasLivres).toHaveLength(0);
    }
  });

  it("nome inválido é pedido de novo; observação 'sem observações' por botão ou por texto segue sem observação", async () => {
    const { portas } = portasFake();
    const { passos } = await conversar(portas, ["reservar", "2", { id: "mesa:id-T1" }, "1", "Ana"]);
    expect(passos[3].estado).toBe("COLLECTING_NAME");
    expect(corpo(passos[3].mensagens[1])).toBe("Em nome de quem fica a reserva?");
    expect(passos[4].estado).toBe("COLLECTING_NOTES");
    for (const semObs of [{ id: "sem_obs", texto: "Sem observações" }, "não", "nenhuma", "sem"] as (string | Toque)[]) {
      const { portas: p2 } = portasFake();
      const r = await conversar(p2, ["reservar", "2", { id: "mesa:id-T1" }, "Ana", semObs]);
      expect(r.ultimo.estado).toBe("REVIEWING_RESERVATION");
      expect(r.ultimo.contexto.observacoes).toBe("");
      expect(corpo(r.ultimo.mensagens[0])).not.toContain("Observações:");
    }
  });

  it("'alterar' no resumo volta a perguntar as pessoas na mesma edição", async () => {
    const { portas } = portasFake();
    const { ultimo } = await conversar(portas, ["reservar", "2", { id: "mesa:id-T1" }, "Ana", "não", { id: "alterar_pedido" }]);
    expect(ultimo.estado).toBe("ASKING_GUEST_COUNT");
    expect(ultimo.contexto.edicaoId).toBe("2099-01-07");
    expect(ultimo.contexto.mesaId).toBeUndefined();
  });

  it("depois de confirmada, uma nova mensagem volta ao menu e é possível reservar de novo", async () => {
    const { portas } = portasFake();
    const { passos } = await conversar(portas, ["reservar", "2", { id: "mesa:id-T1" }, "Ana", "não", { id: "confirmar" }, "reservar"]);
    expect(passos[5].estado).toBe("CONFIRMED");
    expect(passos[6].estado).toBe("ASKING_GUEST_COUNT");
  });
});

describe("edição sem regras completas ou sem edição pronta: nada é inventado", () => {
  it("nenhuma edição pronta: avisa que não consegue confirmar e repassa para a equipe (nunca oferece mesa)", async () => {
    const { portas, chamadas } = portasFake({ edicoes: [] });
    const { ultimo } = await conversar(portas, ["quero reservar"]);
    expect(ultimo.estado).toBe("WAITING_HUMAN");
    expect(ultimo.transferir?.motivo).toBe("edicao_nao_pronta");
    expect(corpo(ultimo.mensagens[0])).toContain("não consigo confirmar reservas por aqui");
    expect(chamadas.mesasLivres).toHaveLength(0);
    expect(chamadas.criar).toHaveLength(0);
  });

  it("a edição deixou de estar pronta no meio da conversa: repassa para a equipe em vez de seguir", async () => {
    const { portas } = portasFake();
    const { passos } = await conversar(portas, ["reservar", "2"]);
    const semEdicao = portasFake({ edicoes: [] }).portas;
    const p = await avancar({ estado: "SELECTING_TABLE", contexto: passos[1].contexto, tentativasSemEntender: 0, atualizadoEm: AGORA.toISOString() }, { forma: "texto", texto: "1" }, semEdicao);
    // SELECTING_TABLE consulta só as mesas; a checagem de prontidão acontece ao montar o resumo
    const ate = await avancar({ estado: "COLLECTING_NOTES", contexto: { ...passos[1].contexto, mesaId: "id-T1", mesaNumero: "T1", nome: "Ana" }, tentativasSemEntender: 0, atualizadoEm: AGORA.toISOString() }, { forma: "texto", texto: "não" }, semEdicao);
    expect(p).toBeDefined();
    expect(ate.estado).toBe("WAITING_HUMAN");
    expect(ate.transferir?.motivo).toBe("edicao_nao_pronta");
  });

  it("o resumo só cita as regras cadastradas: campo vazio simplesmente não aparece", async () => {
    const ed = edicao("2099-01-07", { regras: regras({ tolerancia_min: null, consumacao_minima_centavos: 0, cancelamento_ate_horas: null }) });
    const linhas = T.linhasDeRegras(ed.regras, ed.horario);
    expect(linhas).toEqual(["A casa abre às 19h; o evento começa às 20h.", "Sem consumação mínima."]);
    expect(linhas.join(" ")).not.toMatch(/tolerância|cancelamento/i);
  });
});

describe("dúvidas repetidas e mensagens que não são texto", () => {
  it("duas mensagens seguidas sem entender numa etapa: repassa para a equipe com o motivo 'nao_entendeu'", async () => {
    const { portas } = portasFake();
    const { passos } = await conversar(portas, ["reservar", "sei lá", "hã?"]);
    expect(passos[1].estado).toBe("ASKING_GUEST_COUNT");
    expect(passos[1].tentativasSemEntender).toBe(1);
    expect(passos[2].estado).toBe("WAITING_HUMAN");
    expect(passos[2].transferir?.motivo).toBe("nao_entendeu");
  });

  it("entender no meio zera a contagem", async () => {
    const { portas } = portasFake();
    const { passos } = await conversar(portas, ["reservar", "hã?", "4", { id: "mesa:id-T2" }, "1"]);
    expect(passos[1].tentativasSemEntender).toBe(1);
    expect(passos[2].tentativasSemEntender).toBe(0);
    expect(passos[4].estado).toBe("COLLECTING_NAME");
    expect(passos[4].tentativasSemEntender).toBe(1);
  });

  it("imagem/áudio: pede texto e conta como não entendido; na segunda vez, equipe", async () => {
    const { portas } = portasFake();
    const { passos } = await conversar(portas, ["reservar", null, null]);
    expect(corpo(passos[1].mensagens[0])).toContain("só consigo entender mensagens de texto");
    expect(passos[2].estado).toBe("WAITING_HUMAN");
  });

  it("opção de lista inválida (número fora da lista): repete a lista", async () => {
    const { portas } = portasFake({ edicoes: [edicao("2099-01-07"), edicao("2099-01-14")] });
    const { passos } = await conversar(portas, ["reservar", "9"]);
    expect(passos[1].estado).toBe("SELECTING_EVENT");
    expect(passos[1].mensagens.at(-1)?.tipo).toBe("lista");
  });
});

describe("transferência para atendimento humano", () => {
  it.each([
    ["quero falar com um atendente", "pedido_do_cliente"],
    ["preciso de uma pessoa", "pedido_do_cliente"],
    ["falar com a equipe", "pedido_do_cliente"],
    ["quero fazer o pix agora", "pagamento_ou_estorno"],
    ["quero estorno", "pagamento_ou_estorno"],
    ["vou pagar o sinal", "pagamento_ou_estorno"],
    ["isso foi um absurdo, vou reclamar", "reclamacao"],
    ["péssimo atendimento", "reclamacao"],
  ])("'%s' ⇒ repassa (%s), de qualquer etapa, e o agente para de responder", async (frase, motivo) => {
    for (const previo of [[], ["reservar", "2"]]) {
      const { portas } = portasFake();
      const { ultimo } = await conversar(portas, [...previo, frase]);
      expect(ultimo.estado).toBe("WAITING_HUMAN");
      expect(ultimo.transferir?.motivo).toBe(motivo);
      expect(corpo(ultimo.mensagens[0])).toContain("Vou chamar alguém da equipe");
    }
  });

  it("botão 'Falar com a equipe' repassa; e o detalhe da transferência não leva o texto do cliente", async () => {
    const { portas } = portasFake();
    const { ultimo } = await conversar(portas, [{ id: "humano", texto: "Falar com a equipe" }]);
    expect(ultimo.transferir).toEqual({ motivo: "pedido_do_cliente", detalhe: "Cliente pediu para falar com a equipe." });
  });

  it("em WAITING_HUMAN o agente não responde nada (a pessoa cuida da conversa)", async () => {
    const { portas } = portasFake();
    const p = await avancar({ estado: "WAITING_HUMAN", contexto: {}, tentativasSemEntender: 0, atualizadoEm: AGORA.toISOString() }, { forma: "texto", texto: "oi, alguém aí?" }, portas);
    expect(p.mensagens).toEqual([]);
    expect(p.estado).toBe("WAITING_HUMAN");
    expect(p.transferir).toBeUndefined();
  });

  it("um NOME que contém a palavra 'atendente' não dispara a transferência (só a frase exata)", async () => {
    const { portas, chamadas } = portasFake();
    const { ultimo } = await conversar(portas, ["reservar", "2", { id: "mesa:id-T1" }, "Maria Atendente"]);
    expect(ultimo.estado).toBe("COLLECTING_NOTES");
    expect(ultimo.contexto.nome).toBe("Maria Atendente");
    expect(chamadas.criar).toHaveLength(0);
  });
});

describe("cancelar e alterar reservas do próprio cliente", () => {
  it("cancelar com uma reserva: pede confirmação e cancela", async () => {
    const { portas, chamadas } = portasFake({ reservas: [reserva()] });
    const { passos } = await conversar(portas, ["quero cancelar minha reserva", { id: "cancelar_sim" }]);
    expect(passos[0].estado).toBe("CANCELLING_RESERVATION");
    expect(corpo(passos[0].mensagens[0])).toContain("QH-111111");
    expect(chamadas.cancelar).toEqual(["r1"]);
    expect(corpo(passos[1].mensagens[0])).toContain("Reserva QH-111111 cancelada");
    expect(passos[1].estado).toBe("WELCOME");
  });

  it("'Manter reserva' não cancela nada", async () => {
    const { portas, chamadas } = portasFake({ reservas: [reserva()] });
    await conversar(portas, ["cancelar minha reserva", { id: "cancelar_nao" }]);
    expect(chamadas.cancelar).toHaveLength(0);
  });

  it("com várias reservas, lista e o cliente escolhe (toque, número ou código)", async () => {
    const rs = [reserva({ id: "r1", codigo: "QH-111111" }), reserva({ id: "r2", codigo: "QH-222222", mesaNumero: "T2" })];
    const { portas, chamadas } = portasFake({ reservas: rs });
    const { passos } = await conversar(portas, ["cancelar reserva", "2", "sim"]);
    expect(passos[0].mensagens[0].tipo).toBe("lista");
    expect(passos[1].contexto.reservaId).toBe("r2");
    expect(chamadas.cancelar).toEqual(["r2"]);
  });

  it("fora do prazo de cancelamento (ou prazo não cadastrado): não cancela e repassa para a equipe", async () => {
    for (const cancelar of ["fora_do_prazo", "regra_indefinida"] as ResultadoCancelamento[]) {
      const { portas } = portasFake({ reservas: [reserva()], cancelar });
      const { ultimo } = await conversar(portas, ["cancelar minha reserva", "sim"]);
      expect(ultimo.estado).toBe("WAITING_HUMAN");
      expect(ultimo.transferir?.motivo).toBe("excecao_de_reserva");
    }
  });

  it("sem reservas ativas: avisa e volta ao menu", async () => {
    const { portas } = portasFake({ reservas: [] });
    const { ultimo } = await conversar(portas, ["cancelar minha reserva"]);
    expect(corpo(ultimo.mensagens[0])).toBe("Não encontrei reservas ativas para este número.");
    expect(ultimo.estado).toBe("WELCOME");
  });

  it("alterar nome e observações é feito pelo agente; 'Outra mudança' (mesa, pessoas, data) vai para a equipe", async () => {
    const { portas, chamadas } = portasFake({ reservas: [reserva()] });
    const { passos } = await conversar(portas, ["quero alterar minha reserva", { id: "campo_nome" }, "Ana Paula"]);
    expect(chamadas.atualizar).toEqual([{ id: "r1", campos: { nome: "Ana Paula" } }]);
    expect(corpo(passos[2].mensagens[0])).toContain("atualizei a reserva QH-111111");

    const p2 = portasFake({ reservas: [reserva()] });
    await conversar(p2.portas, ["alterar reserva", { id: "campo_obs" }, "nenhuma"]);
    expect(p2.chamadas.atualizar).toEqual([{ id: "r1", campos: { observacoes: "" } }]);

    const p3 = portasFake({ reservas: [reserva()] });
    const { ultimo } = await conversar(p3.portas, ["alterar reserva", { id: "campo_outro" }]);
    expect(ultimo.estado).toBe("WAITING_HUMAN");
    expect(ultimo.transferir?.motivo).toBe("excecao_de_reserva");
    expect(p3.chamadas.atualizar).toHaveLength(0);
  });

  it("'minhas reservas': lista o que o número tem; sem nada, avisa", async () => {
    const { portas } = portasFake({ reservas: [reserva(), reserva({ id: "r2", codigo: "QH-222222", status: "aguardando" })] });
    const { ultimo } = await conversar(portas, [{ id: "minhas", texto: "Minhas reservas" }]);
    expect(corpo(ultimo.mensagens[0])).toContain("QH-111111");
    expect(corpo(ultimo.mensagens[0])).toContain("aguardando confirmação");
    const vazio = await conversar(portasFake().portas, ["minhas reservas"]);
    expect(corpo(vazio.ultimo.mensagens[0])).toBe("Não encontrei reservas ativas para este número.");
  });
});

describe("estado parado por mais de 24 h", () => {
  it("recomeça do menu, sem reaproveitar contexto antigo", async () => {
    const { portas } = portasFake();
    const antigo = new Date(AGORA.getTime() - 25 * 3_600_000).toISOString();
    const p = await avancar({ estado: "SELECTING_TABLE", contexto: { edicaoId: "2099-01-07", pessoas: 4, opcoes: [{ id: "mesa:id-T2", rotulo: "x" }] }, tentativasSemEntender: 1, atualizadoEm: antigo }, { forma: "texto", texto: "2" }, portas);
    expect(p.estado).toBe("WELCOME");
    expect(p.contexto).toEqual({});
    expect(p.tentativasSemEntender).toBeLessThanOrEqual(1);
  });

  it("dentro de 24 h mantém o estado", async () => {
    const { portas } = portasFake();
    const recente = new Date(AGORA.getTime() - 23 * 3_600_000).toISOString();
    const p = await avancar({ estado: "ASKING_GUEST_COUNT", contexto: { edicaoId: "2099-01-07" }, tentativasSemEntender: 0, atualizadoEm: recente }, { forma: "texto", texto: "4" }, portas);
    expect(p.estado).toBe("SELECTING_TABLE");
  });
});

describe("regras de conteúdo e de formato", () => {
  const fluxos = async () => {
    const eds = [edicao("2099-01-07"), edicao("2099-01-14", { artista: "Tatu Bola Show" })];
    const { portas } = portasFake({ edicoes: eds, reservas: [reserva()] });
    const roteiros: (string | Toque | null)[][] = [
      ["oi"], ["reservar", "1", "4", { id: "mesa:id-T2" }, "Ana", "aniversário", { id: "confirmar" }], ["reservar", "2", "4"], ["minhas reservas"],
      ["cancelar minha reserva", "sim"], ["alterar reserva", { id: "campo_nome" }, "Ana"], ["quero falar com atendente"], ["reservar", null, null], ["reservar", "9", "9"],
    ];
    const todas: Mensagem[] = [];
    for (const r of roteiros) todas.push(...(await conversar(portas, r)).todasAsMensagens);
    return todas;
  };

  it("NUNCA cita outra casa: nenhuma resposta contém 'Tatu Bola', mesmo com o termo no nome do artista vindo do banco", async () => {
    const todas = await fluxos();
    expect(todas.length).toBeGreaterThan(20);
    expect(todoTexto(todas)).not.toMatch(/tatu/i);
    expect(T.campoPublico("Tatu Bola Show")).toBe("");
    expect(T.campoPublico("TATU  BOLA")).toBe("");
    expect(T.campoPublico("Jhean Marcell")).toBe("Jhean Marcell");
  });

  it("toda menção ao local é o Florindos Bar, em Uberlândia", async () => {
    const todas = await fluxos();
    const comLocal = todas.filter((m) => /Florindos/i.test(m.corpo));
    expect(comLocal.length).toBeGreaterThan(3);
    for (const m of comLocal) expect(m.corpo).toMatch(/Florindos Bar/);
    expect(T.LOCAL).toBe("Florindos Bar, em Uberlândia");
  });

  it("limites da WhatsApp Cloud API: até 3 botões (título ≤ 20), lista com até 10 itens (título ≤ 24, descrição ≤ 72), corpo ≤ 1024", async () => {
    const grande = Array.from({ length: 14 }, (_, i) => mesa(`Mesa-com-nome-muito-comprido-${i + 1}`, 4, "Área externa coberta com vista para o jardim principal da casa"));
    const { portas } = portasFake({ mesas: grande });
    const roteiro = await conversar(portas, ["reservar", "4"]);
    const todas = [...(await fluxos()), ...roteiro.todasAsMensagens];
    for (const m of todas) {
      expect(m.corpo.length).toBeLessThanOrEqual(m.tipo === "texto" ? 4096 : 1024);
      if (m.tipo === "botoes") {
        expect(m.botoes.length).toBeGreaterThanOrEqual(1);
        expect(m.botoes.length).toBeLessThanOrEqual(3);
        for (const b of m.botoes) expect(b.titulo.length).toBeLessThanOrEqual(20);
      }
      if (m.tipo === "lista") {
        expect(m.itens.length).toBeLessThanOrEqual(10);
        expect(m.rotuloBotao.length).toBeLessThanOrEqual(20);
        for (const i of m.itens) { expect(i.titulo.length).toBeLessThanOrEqual(24); expect((i.descricao ?? "").length).toBeLessThanOrEqual(72); }
      }
    }
    const lista = roteiro.ultimo.mensagens[0];
    expect(lista.tipo === "lista" && lista.itens).toHaveLength(10);
    expect(corpo(lista)).toContain("mostrando 10 de 14");
  });

  it("é determinística: a mesma conversa produz exatamente as mesmas respostas", async () => {
    const roteiro: (string | Toque)[] = ["oi", { id: "reservar" }, "4", { id: "mesa:id-T2" }, "Ana", "não", { id: "confirmar" }];
    const a = await conversar(portasFake().portas, roteiro);
    const b = await conversar(portasFake().portas, roteiro);
    expect(a.passos).toEqual(b.passos);
  });

  it("nenhum estado novo é inventado: todos os estados devolvidos pertencem à lista oficial", async () => {
    const oficiais: EstadoConversa[] = ["NEW", "WELCOME", "SELECTING_EVENT", "ASKING_GUEST_COUNT", "CHECKING_AVAILABILITY", "SELECTING_TABLE", "COLLECTING_NAME", "COLLECTING_NOTES", "REVIEWING_RESERVATION", "CONFIRMED", "ALTERING_RESERVATION", "CANCELLING_RESERVATION", "WAITING_HUMAN", "CLOSED"];
    const { portas } = portasFake({ reservas: [reserva()] });
    for (const r of [["oi"], ["reservar", "2", { id: "mesa:id-T1" }, "Ana", "não", { id: "confirmar" }], ["cancelar minha reserva", "sim"], ["pix"]] as (string | Toque)[][]) {
      const { passos } = await conversar(portas, r);
      for (const p of passos) expect(oficiais).toContain(p.estado);
    }
  });

  it("o contexto guardado nunca contém segredos nem o texto bruto do cliente além do necessário", async () => {
    const { portas } = portasFake();
    const { passos } = await conversar(portas, ["reservar", "4", { id: "mesa:id-T2" }, "Ana Souza"]);
    // o que vai para o banco é o JSON do contexto (chaves indefinidas somem)
    const gravado = JSON.parse(JSON.stringify(passos[3].contexto));
    expect(Object.keys(gravado).sort()).toEqual(["edicaoId", "mesaId", "mesaLugares", "mesaNumero", "nome", "pessoas"]);
    expect(JSON.stringify(gravado)).not.toMatch(/token|secret|senha/i);
  });
});
