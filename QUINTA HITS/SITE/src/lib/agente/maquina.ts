import { inteiroEntre } from "@/lib/reserva";
import * as T from "./textos";
import type {
  Contexto, ConversaParaMaquina, EdicaoOferecida, EntradaCliente, EstadoConversa, Mensagem, MotivoTransferencia, OpcaoOferecida, Passo, Portas,
} from "./tipos";

/**
 * MÁQUINA DE ESTADOS DETERMINÍSTICA do agente de reservas (fase 1, SEM inteligência artificial).
 *
 * Só menus, botões, listas, palavras-chave e validações. Nada aqui acessa banco ou rede: tudo que vem de fora passa
 * pelas `Portas`, então o mesmo código roda em produção, nos testes e na demonstração simulada.
 *
 * Garantias:
 *  - a disponibilidade vem SEMPRE das portas (uma consulta só, a mesma do site e do painel); nunca é presumida;
 *  - a reserva só é confirmada ao cliente DEPOIS de gravada (a porta devolve o código);
 *  - qualquer coisa fora do previsto (pagamento, reclamação, pedido de pessoa, edição sem regras, dúvida repetida,
 *    erro técnico) vira transferência para atendimento humano.
 */

const DIA_MS = 24 * 3_600_000;
const MAX_TENTATIVAS_SEM_ENTENDER = 2;

/** Minúsculas, sem acentos, espaços e pontuação final aparados. */
export const normalizar = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500)
    .replace(/[!?.,;:]+$/g, "")
    .trim();

const PEDIDO = "(?:quero|queria|preciso de|precisava de|gostaria de)";
const QUEM = "(?:um |uma |o |a )?(?:pessoa|humano|atendente)";
const RE_HUMANO = new RegExp(`\\b(humano|atendente|atendimento humano|falar com (?:um |uma |o |a )?(?:pessoa|humano|atendente|alguem|gente|equipe|responsavel)|${PEDIDO} (?:falar com )?${QUEM})\\b`);
const RE_HUMANO_FORTE = new RegExp(`^(atendente|humano|atendimento humano|falar com (?:um |uma |o |a )?(?:pessoa|humano|atendente|alguem|equipe)|${PEDIDO} (?:falar com )?${QUEM})$`);
const RE_RECLAMACAO = /\b(reclamacao|reclamar|reclamando|pessimo|horrivel|absurdo|indignad[oa]|procon|processar)\b/;
const RE_PAGAMENTO = /\b(pix|pagamento|pagar|estorno|estornar|reembolso|devolucao|cobranca|cobrado|boleto|cartao|sinal)\b/;
const RE_CANCELAR_RESERVA = /(cancel\w*.*reserva|reserva.*cancel\w*)/;
const RE_ALTERAR_RESERVA = /((alter\w*|mud\w*|troc\w*|modific\w*).*reserva|reserva.*(alter\w*|mud\w*|troc\w*))/;
const RE_MENU = /^(menu|inicio|recomecar|reiniciar|comecar de novo|voltar)$/;
const RE_ABORTAR = /^(cancelar|desistir|deixa|deixa pra la|nao quero mais)$/;
const RE_MINHAS = /\b(minhas? reservas?|consultar reserva|ver reserva)\b/;
const RE_RESERVAR = /\b(reservar|reserva|mesa)\b/;
const RE_SIM = /^(sim|s|confirmo|confirmar|confirma|ok|pode confirmar|isso|certo|pode)$/;
const RE_NAO = /^(nao|n|nenhuma|nenhum|sem|sem observacoes|nada|-)$/;

const EM_FLUXO: EstadoConversa[] = ["SELECTING_EVENT", "ASKING_GUEST_COUNT", "SELECTING_TABLE", "COLLECTING_NAME", "COLLECTING_NOTES", "REVIEWING_RESERVATION", "CANCELLING_RESERVATION", "ALTERING_RESERVATION"];

const NUMEROS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };

const passo = (estado: EstadoConversa, contexto: Contexto, mensagens: Mensagem[], tentativas = 0): Passo => ({ estado, contexto, mensagens, tentativasSemEntender: tentativas });

const paraHumano = (motivo: MotivoTransferencia, detalhe: string, contexto: Contexto): Passo => ({
  estado: "WAITING_HUMAN", contexto, mensagens: [T.transferencia()], tentativasSemEntender: 0, transferir: { motivo, detalhe },
});

const paraHumanoComAviso = (motivo: MotivoTransferencia, detalhe: string, contexto: Contexto, aviso: Mensagem): Passo => ({
  estado: "WAITING_HUMAN", contexto, mensagens: [aviso, T.transferencia()], tentativasSemEntender: 0, transferir: { motivo, detalhe },
});

const texto = (corpo: string): Mensagem => ({ tipo: "texto", corpo });

/** Resposta do cliente a uma lista/botões: por toque (id), pelo número (1, 2, 3...) ou pela data escrita (08/10). */
function escolherOpcao(entrada: EntradaCliente, opcoes: OpcaoOferecida[]): string | null {
  if (entrada.forma === "interativa") return opcoes.some((o) => o.id === entrada.id) ? entrada.id : null;
  if (entrada.forma !== "texto") return null;
  const t = normalizar(entrada.texto);
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    return n >= 1 && n <= opcoes.length ? opcoes[n - 1].id : null;
  }
  if (t.length >= 3) {
    const achadas = opcoes.filter((o) => normalizar(o.rotulo).startsWith(t));
    if (achadas.length === 1) return achadas[0].id;
  }
  return null;
}

function lerPessoas(t: string): number | null {
  const direto = /^(\d{1,2})( pessoas?)?$/.exec(t) ?? /(?:para|somos|vamos|em|com)\s+(\d{1,2})\b/.exec(t);
  if (direto) return inteiroEntre(direto[1], 1, 50);
  const palavra = /^(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)( pessoas?)?$/.exec(t);
  return palavra ? NUMEROS[palavra[1]] : null;
}

/** Nome da reserva: 2 a 80 caracteres, com letras, sem caracteres de controle. */
function lerNome(bruto: string): string | null {
  const limpo = bruto.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return limpo.length >= 2 && limpo.length <= 80 && /^\p{L}[\p{L}\p{M}' .-]*$/u.test(limpo) ? limpo : null;
}

const limparObservacao = (bruto: string) => bruto.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

function naoEntendido(estado: EstadoConversa, ctx: Contexto, tentativas: number, reexibir: Mensagem[], inicio = T.naoEntendi()): Passo {
  const n = tentativas + 1;
  if (n >= MAX_TENTATIVAS_SEM_ENTENDER) return paraHumano("nao_entendeu", `Não entendeu duas vezes seguidas (etapa ${estado}).`, ctx);
  return passo(estado, ctx, [texto(inicio), ...reexibir], n);
}

const opcoesDe = (itens: { id: string; titulo: string; descricao?: string }[]): OpcaoOferecida[] => itens.map((i) => ({ id: i.id, rotulo: i.descricao ? `${i.titulo} ${i.descricao}` : i.titulo }));

/** Próxima etapa depois de saber a edição: perguntar quantas pessoas. */
const perguntarPessoas = (ed: EdicaoOferecida, ctx: Contexto): Passo => passo("ASKING_GUEST_COUNT", { ...ctx, edicaoId: ed.id, opcoes: undefined }, [T.perguntarPessoas(ed)]);

async function iniciarReserva(portas: Portas, saudar: boolean): Promise<Passo> {
  const eds = await portas.edicoesProntas();
  if (eds.length === 0) return paraHumanoComAviso("edicao_nao_pronta", "Nenhuma edição com regras completas e liberada para o atendimento automático.", {}, T.semEdicaoPronta());
  const abertura = saudar ? [T.saudacao()] : [];
  if (eds.length === 1) {
    const p = perguntarPessoas(eds[0], {});
    return { ...p, mensagens: [...abertura, ...p.mensagens] };
  }
  const { mensagem } = T.escolherEdicao(eds);
  return passo("SELECTING_EVENT", { opcoes: eds.map((e) => ({ id: `ed:${e.id}`, rotulo: T.rotuloEdicao(e) })) }, [...abertura, mensagem]);
}

async function verificarDisponibilidade(ctx: Contexto, portas: Portas): Promise<Passo> {
  // Etapa CHECKING_AVAILABILITY: consulta a disponibilidade REAL (a mesma do site e do painel).
  const pessoas = ctx.pessoas ?? 0;
  const mesas = await portas.mesasLivres(ctx.edicaoId ?? "", pessoas);
  if (mesas.length === 0) return passo("WELCOME", {}, [T.semMesa(pessoas)]);
  const { mensagem, itens } = T.escolherMesa(mesas, pessoas);
  return passo("SELECTING_TABLE", { ...ctx, opcoes: opcoesDe(itens) }, [mensagem]);
}

async function iniciarCancelamento(portas: Portas, alterar: boolean): Promise<Passo> {
  const rs = await portas.reservasDoContato();
  const estado: EstadoConversa = alterar ? "ALTERING_RESERVATION" : "CANCELLING_RESERVATION";
  if (rs.length === 0) return passo("WELCOME", {}, [texto(T.semReservas()), T.menu()]);
  if (rs.length === 1) {
    return alterar
      ? passo(estado, { reservaId: rs[0].id, passo: "campo" }, [T.escolherCampoAlteracao(rs[0])])
      : passo(estado, { reservaId: rs[0].id, passo: "confirmar" }, [T.confirmarCancelamento(rs[0])]);
  }
  const { mensagem, itens } = T.escolherReserva(rs, alterar ? "alterar" : "cancelar");
  return passo(estado, { passo: "escolher", opcoes: opcoesDe(itens) }, [mensagem]);
}

async function tratarCancelamento(ctx: Contexto, entrada: EntradaCliente, t: string, portas: Portas, tent: number): Promise<Passo> {
  const rs = await portas.reservasDoContato();
  if (ctx.passo === "escolher") {
    const id = escolherOpcao(entrada, ctx.opcoes ?? []);
    const r = rs.find((x) => `res:${x.id}` === id);
    if (!r) {
      const { mensagem, itens } = T.escolherReserva(rs, "cancelar");
      return naoEntendido("CANCELLING_RESERVATION", { ...ctx, opcoes: opcoesDe(itens) }, tent, [mensagem], T.opcaoInvalida());
    }
    return passo("CANCELLING_RESERVATION", { reservaId: r.id, passo: "confirmar" }, [T.confirmarCancelamento(r)]);
  }
  const r = rs.find((x) => x.id === ctx.reservaId);
  if (!r) return passo("WELCOME", {}, [texto(T.reservaNaoEncontrada()), T.menu()]);
  const sim = entrada.forma === "interativa" ? entrada.id === "cancelar_sim" : RE_SIM.test(t);
  const nao = entrada.forma === "interativa" ? entrada.id === "cancelar_nao" : RE_NAO.test(t);
  if (nao) return passo("WELCOME", {}, [texto(T.reservaMantida()), T.menu()]);
  if (!sim) return naoEntendido("CANCELLING_RESERVATION", ctx, tent, [T.confirmarCancelamento(r)]);
  const res = await portas.cancelarReserva(r.id);
  if (res === "ok") return passo("WELCOME", {}, [texto(T.reservaCancelada(r.codigo)), T.menu()]);
  if (res === "nao_encontrada") return passo("WELCOME", {}, [texto(T.reservaNaoEncontrada()), T.menu()]);
  if (res === "erro") return paraHumano("erro_tecnico", "Falha ao cancelar a reserva.", {});
  return paraHumano("excecao_de_reserva", res === "fora_do_prazo" ? "Cancelamento fora do prazo cadastrado." : "Prazo de cancelamento não cadastrado para a edição.", {});
}

async function tratarAlteracao(ctx: Contexto, entrada: EntradaCliente, t: string, portas: Portas, tent: number): Promise<Passo> {
  const rs = await portas.reservasDoContato();
  if (ctx.passo === "escolher") {
    const id = escolherOpcao(entrada, ctx.opcoes ?? []);
    const r = rs.find((x) => `res:${x.id}` === id);
    if (!r) {
      const { mensagem, itens } = T.escolherReserva(rs, "alterar");
      return naoEntendido("ALTERING_RESERVATION", { ...ctx, opcoes: opcoesDe(itens) }, tent, [mensagem], T.opcaoInvalida());
    }
    return passo("ALTERING_RESERVATION", { reservaId: r.id, passo: "campo" }, [T.escolherCampoAlteracao(r)]);
  }
  const r = rs.find((x) => x.id === ctx.reservaId);
  if (!r) return passo("WELCOME", {}, [texto(T.reservaNaoEncontrada()), T.menu()]);

  if (ctx.passo === "campo") {
    const id = entrada.forma === "interativa" ? entrada.id : "";
    if (id === "campo_nome") return passo("ALTERING_RESERVATION", { reservaId: r.id, passo: "valor", campo: "nome" }, [T.pedirNovoValor("nome")]);
    if (id === "campo_obs") return passo("ALTERING_RESERVATION", { reservaId: r.id, passo: "valor", campo: "observacoes" }, [T.pedirNovoValor("observacoes")]);
    if (id === "campo_outro") return paraHumano("excecao_de_reserva", "Cliente quer alterar mesa, pessoas ou data de uma reserva.", {});
    return naoEntendido("ALTERING_RESERVATION", ctx, tent, [T.escolherCampoAlteracao(r)]);
  }

  // passo "valor": texto livre com o novo nome ou a nova observação
  if (entrada.forma !== "texto") return naoEntendido("ALTERING_RESERVATION", ctx, tent, [T.pedirNovoValor(ctx.campo ?? "nome")], T.soTexto());
  let campos: { nome?: string; observacoes?: string };
  if (ctx.campo === "nome") {
    const nome = lerNome(entrada.texto);
    if (!nome) return naoEntendido("ALTERING_RESERVATION", ctx, tent, [T.pedirNovoValor("nome")], T.nomeInvalido());
    campos = { nome };
  } else {
    campos = { observacoes: RE_NAO.test(t) ? "" : limparObservacao(entrada.texto) };
  }
  const ok = await portas.atualizarReserva(r.id, campos);
  if (!ok) return paraHumano("erro_tecnico", "Falha ao atualizar a reserva.", {});
  return passo("WELCOME", {}, [texto(T.reservaAtualizada(r.codigo)), T.menu()]);
}

/** Um passo da conversa: recebe o estado atual e o que o cliente mandou; devolve o novo estado e as respostas. */
export async function avancar(conversa: ConversaParaMaquina, entrada: EntradaCliente, portas: Portas): Promise<Passo> {
  let estado = conversa.estado;
  let ctx: Contexto = { ...conversa.contexto };
  let tent = conversa.tentativasSemEntender;

  // Conversa parada há mais de 24 h recomeça do zero (expiração segura do estado).
  if (estado !== "NEW" && portas.agora().getTime() - new Date(conversa.atualizadoEm).getTime() > DIA_MS) {
    estado = "WELCOME"; ctx = {}; tent = 0;
  }
  // O agente não responde enquanto uma pessoa cuida da conversa.
  if (estado === "WAITING_HUMAN") return passo(estado, ctx, [], tent);

  const t = entrada.forma === "nao_suportado" ? "" : normalizar(entrada.forma === "interativa" ? entrada.texto || entrada.id : entrada.texto);
  const id = entrada.forma === "interativa" ? entrada.id : "";
  const textoLivre = estado === "COLLECTING_NAME" || estado === "COLLECTING_NOTES" || (estado === "ALTERING_RESERVATION" && ctx.passo === "valor");

  if (entrada.forma !== "nao_suportado") {
    // Situações que sempre viram atendimento humano.
    if (id === "humano" || (textoLivre ? RE_HUMANO_FORTE.test(t) : RE_HUMANO.test(t))) return paraHumano("pedido_do_cliente", "Cliente pediu para falar com a equipe.", ctx);
    if (RE_PAGAMENTO.test(t)) return paraHumano("pagamento_ou_estorno", "Assunto de pagamento, sinal ou estorno.", ctx);
    if (RE_RECLAMACAO.test(t)) return paraHumano("reclamacao", "Cliente demonstrou insatisfação ou reclamação.", ctx);
    // Navegação.
    if (RE_MENU.test(t)) return passo("WELCOME", {}, [T.menu()]);
    if (EM_FLUXO.includes(estado) && RE_ABORTAR.test(t)) return passo("WELCOME", {}, [texto(T.fluxoCancelado()), T.menu()]);
    if (!textoLivre) {
      if (RE_CANCELAR_RESERVA.test(t)) return iniciarCancelamento(portas, false);
      if (RE_ALTERAR_RESERVA.test(t)) return iniciarCancelamento(portas, true);
      if (id === "minhas" || RE_MINHAS.test(t)) {
        const rs = await portas.reservasDoContato();
        return passo("WELCOME", {}, [texto(rs.length ? T.listarReservas(rs) : T.semReservas()), T.menu()]);
      }
    }
  }

  switch (estado) {
    case "NEW":
    case "CLOSED":
      if (id === "reservar" || RE_RESERVAR.test(t)) return iniciarReserva(portas, true);
      return passo("WELCOME", {}, [T.boasVindas()]);

    case "WELCOME":
    case "CONFIRMED":
    case "CHECKING_AVAILABILITY":
      if (id === "reservar" || RE_RESERVAR.test(t)) return iniciarReserva(portas, false);
      if (entrada.forma === "nao_suportado") return naoEntendido("WELCOME", {}, tent, [T.menu()], T.soTexto());
      return naoEntendido("WELCOME", {}, tent, [T.menu()]);

    case "SELECTING_EVENT": {
      const eds = await portas.edicoesProntas();
      if (eds.length === 0) return paraHumanoComAviso("edicao_nao_pronta", "A edição deixou de estar pronta durante a conversa.", {}, T.semEdicaoPronta());
      const escolha = escolherOpcao(entrada, ctx.opcoes ?? []);
      const ed = eds.find((e) => `ed:${e.id}` === escolha);
      if (!ed) {
        const { mensagem } = T.escolherEdicao(eds);
        return naoEntendido("SELECTING_EVENT", { opcoes: eds.map((e) => ({ id: `ed:${e.id}`, rotulo: T.rotuloEdicao(e) })) }, tent, [mensagem], entrada.forma === "nao_suportado" ? T.soTexto() : T.opcaoInvalida());
      }
      return perguntarPessoas(ed, {});
    }

    case "ASKING_GUEST_COUNT": {
      const eds = await portas.edicoesProntas();
      const ed = eds.find((e) => e.id === ctx.edicaoId);
      if (!ed) return paraHumanoComAviso("edicao_nao_pronta", "A edição deixou de estar pronta durante a conversa.", {}, T.semEdicaoPronta());
      const pessoas = entrada.forma === "nao_suportado" ? null : lerPessoas(t);
      if (pessoas === null) return naoEntendido("ASKING_GUEST_COUNT", ctx, tent, [T.perguntarPessoas(ed)], entrada.forma === "nao_suportado" ? T.soTexto() : T.pessoasInvalido());
      return verificarDisponibilidade({ ...ctx, pessoas }, portas);
    }

    case "SELECTING_TABLE": {
      const livres = await portas.mesasLivres(ctx.edicaoId ?? "", ctx.pessoas ?? 0);
      const escolha = escolherOpcao(entrada, ctx.opcoes ?? []);
      const mesa = livres.find((m) => `mesa:${m.id}` === escolha);
      if (!mesa) {
        if (escolha && livres.length > 0) {
          // A mesa escolhida foi reservada por outra pessoa no meio da conversa: mostra as que restam.
          const { mensagem, itens } = T.escolherMesa(livres, ctx.pessoas ?? 0);
          return passo("SELECTING_TABLE", { ...ctx, opcoes: opcoesDe(itens) }, [texto(T.mesaOcupada()), mensagem]);
        }
        if (livres.length === 0) return passo("WELCOME", {}, [T.semMesa(ctx.pessoas ?? 0)]);
        const { mensagem, itens } = T.escolherMesa(livres, ctx.pessoas ?? 0);
        return naoEntendido("SELECTING_TABLE", { ...ctx, opcoes: opcoesDe(itens) }, tent, [mensagem], entrada.forma === "nao_suportado" ? T.soTexto() : T.opcaoInvalida());
      }
      return passo("COLLECTING_NAME", { ...ctx, mesaId: mesa.id, mesaNumero: mesa.numero, mesaLugares: mesa.lugares, opcoes: undefined }, [T.pedirNome()]);
    }

    case "COLLECTING_NAME": {
      const nome = entrada.forma === "texto" ? lerNome(entrada.texto) : null;
      if (!nome) return naoEntendido("COLLECTING_NAME", ctx, tent, [T.pedirNome()], entrada.forma === "texto" ? T.nomeInvalido() : T.soTexto());
      return passo("COLLECTING_NOTES", { ...ctx, nome }, [T.pedirObservacoes()]);
    }

    case "COLLECTING_NOTES": {
      if (entrada.forma === "nao_suportado") return naoEntendido("COLLECTING_NOTES", ctx, tent, [T.pedirObservacoes()], T.soTexto());
      const semObs = id === "sem_obs" || RE_NAO.test(t);
      const observacoes = semObs ? "" : limparObservacao(entrada.texto);
      const eds = await portas.edicoesProntas();
      const ed = eds.find((e) => e.id === ctx.edicaoId);
      if (!ed) return paraHumanoComAviso("edicao_nao_pronta", "A edição deixou de estar pronta durante a conversa.", {}, T.semEdicaoPronta());
      return passo("REVIEWING_RESERVATION", { ...ctx, observacoes }, [T.resumo({ edicao: ed, mesaNumero: ctx.mesaNumero ?? "", mesaLugares: ctx.mesaLugares, pessoas: ctx.pessoas ?? 0, nome: ctx.nome ?? "", observacoes })]);
    }

    case "REVIEWING_RESERVATION": {
      const eds = await portas.edicoesProntas();
      const ed = eds.find((e) => e.id === ctx.edicaoId);
      if (!ed) return paraHumanoComAviso("edicao_nao_pronta", "A edição deixou de estar pronta durante a conversa.", {}, T.semEdicaoPronta());
      const reexibir = T.resumo({ edicao: ed, mesaNumero: ctx.mesaNumero ?? "", mesaLugares: ctx.mesaLugares, pessoas: ctx.pessoas ?? 0, nome: ctx.nome ?? "", observacoes: ctx.observacoes ?? "" });
      const confirmar = id === "confirmar" || (id === "" && RE_SIM.test(t));
      const alterar = id === "alterar_pedido" || /^(alterar|mudar|trocar)$/.test(t);
      const cancelar = id === "cancelar_fluxo" || RE_NAO.test(t);
      if (alterar) return perguntarPessoas(ed, { edicaoId: ed.id });
      if (cancelar) return passo("WELCOME", {}, [texto(T.fluxoCancelado()), T.menu()]);
      if (!confirmar) return naoEntendido("REVIEWING_RESERVATION", ctx, tent, [reexibir]);

      // A reserva é gravada ANTES de qualquer confirmação ao cliente.
      const r = await portas.criarReserva({ edicaoId: ed.id, mesaId: ctx.mesaId ?? "", pessoas: ctx.pessoas ?? 0, nome: ctx.nome ?? "", observacoes: ctx.observacoes ?? "" });
      if (r.ok) return passo("CONFIRMED", {}, [T.confirmada({ codigo: r.codigo, mesaNumero: r.mesaNumero, pessoas: ctx.pessoas ?? 0, edicao: ed })]);
      if (r.motivo === "mesa_indisponivel") {
        const livres = await portas.mesasLivres(ed.id, ctx.pessoas ?? 0);
        if (livres.length === 0) return passo("WELCOME", {}, [texto(T.mesaOcupada()), T.semMesa(ctx.pessoas ?? 0)]);
        const { mensagem, itens } = T.escolherMesa(livres, ctx.pessoas ?? 0);
        return passo("SELECTING_TABLE", { edicaoId: ed.id, pessoas: ctx.pessoas, nome: ctx.nome, observacoes: ctx.observacoes, opcoes: opcoesDe(itens) }, [texto(T.mesaOcupada()), mensagem]);
      }
      if (r.motivo === "limite_por_whatsapp") return paraHumano("excecao_de_reserva", "Este WhatsApp já atingiu o limite de reservas nesta edição.", {});
      if (r.motivo === "edicao_fechada" || r.motivo === "nao_pronta") return paraHumanoComAviso("edicao_nao_pronta", "A edição deixou de aceitar reservas automáticas.", {}, T.semEdicaoPronta());
      return paraHumanoComAviso("erro_tecnico", "Falha ao gravar a reserva.", {}, T.erroTecnico());
    }

    case "CANCELLING_RESERVATION":
      return tratarCancelamento(ctx, entrada, t, portas, tent);

    case "ALTERING_RESERVATION":
      return tratarAlteracao(ctx, entrada, t, portas, tent);

    default:
      return passo("WELCOME", {}, [T.boasVindas()]);
  }
}
