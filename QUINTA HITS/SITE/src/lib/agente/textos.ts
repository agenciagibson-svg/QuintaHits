import { site } from "@/config/site";
import { formatData } from "@/lib/edicao";
import { formatarReais, type RegrasEdicao } from "@/lib/regrasEdicao";
import type { Botao, EdicaoOferecida, ItemLista, Mensagem, MesaOferecida, ReservaResumo } from "./tipos";

/**
 * Todas as respostas do agente. Regras de conteúdo (protegidas por teste):
 *  - o local é sempre o Florindos Bar (Uberlândia/MG) e nenhuma resposta cita outra casa;
 *  - nenhum horário, valor, tolerância ou regra é inventado: só entra o que veio cadastrado para a edição;
 *  - respostas curtas, cordiais e sem prometer prazo de atendimento.
 */

export const LOCAL = `${site.casa.nome}, em ${site.cidade}`;

const PROIBIDO = /tatu\s*bola/i;

/** Campos vindos do banco e escritos por pessoas (artista, observações...) nunca podem levar o termo proibido. */
export const campoPublico = (v: string): string => (PROIBIDO.test(v) ? "" : v);

const cortar = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

const texto = (corpo: string): Mensagem => ({ tipo: "texto", corpo });
const botoes = (corpo: string, lista: Botao[]): Mensagem => ({ tipo: "botoes", corpo, botoes: lista.map((b) => ({ id: b.id, titulo: cortar(b.titulo, 20) })) });

export const BOTOES_MENU: Botao[] = [
  { id: "reservar", titulo: "Reservar mesa" },
  { id: "minhas", titulo: "Minhas reservas" },
  { id: "humano", titulo: "Falar com a equipe" },
];

export const boasVindas = (): Mensagem =>
  botoes(`Olá! Aqui é o atendimento de reservas da *${site.nome}*. Toda quinta, no ${LOCAL}. Como posso ajudar?`, BOTOES_MENU);

export const menu = (prefixo = ""): Mensagem => botoes(`${prefixo}${prefixo ? " " : ""}Posso ajudar com mais alguma coisa?`, BOTOES_MENU);

export const transferencia = (): Mensagem =>
  texto(`Certo! Vou chamar alguém da equipe da ${site.nome} para continuar com você por aqui.`);

export const saudacao = (): Mensagem => texto(`Olá! Aqui é o atendimento de reservas da *${site.nome}*.`);

export const naoEntendi = (): string => "Não consegui entender.";

export const soTexto = (): string => "Por aqui eu só consigo entender mensagens de texto.";

export function escolherEdicao(edicoes: EdicaoOferecida[]): { mensagem: Mensagem; itens: ItemLista[] } {
  const itens: ItemLista[] = edicoes.map((e) => ({
    id: `ed:${e.id}`,
    titulo: formatData(e.data, "curta"),
    descricao: cortar(campoPublico(e.artista) || "Line-up em breve", 72),
  }));
  return {
    itens,
    mensagem: { tipo: "lista", corpo: "Para qual quinta você quer reservar? Toque em uma opção ou responda com o número.", rotuloBotao: "Escolher quinta", itens },
  };
}

/** Rótulo curto da opção (a data em dd/mm vem primeiro: o cliente pode responder "08/10"). */
export const rotuloEdicao = (e: EdicaoOferecida) => `${formatData(e.data, "numerica")} ${campoPublico(e.artista) || "line-up em breve"}`;

export const perguntarPessoas = (e: EdicaoOferecida): Mensagem =>
  texto(`${cap(formatData(e.data, "longa"))}, no ${LOCAL} (evento às ${e.horario}). Quantas pessoas vão?`);

export const pessoasInvalido = (): string => "Me diga só o número de pessoas, por exemplo: 4.";

export const semMesa = (pessoas: number): Mensagem =>
  botoes(`Não encontrei mesa livre para ${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"} nessa quinta. Posso te ajudar com outra data ou chamar a equipe.`, [
    { id: "reservar", titulo: "Outra data" },
    { id: "humano", titulo: "Falar com a equipe" },
  ]);

export function escolherMesa(mesas: MesaOferecida[], pessoas: number): { mensagem: Mensagem; itens: ItemLista[] } {
  const ordenadas = [...mesas].sort((a, b) => a.lugares - b.lugares || a.numero.localeCompare(b.numero, "pt-BR", { numeric: true })).slice(0, 10);
  const itens: ItemLista[] = ordenadas.map((m) => ({
    id: `mesa:${m.id}`,
    titulo: cortar(`Mesa ${m.numero}`, 24),
    descricao: cortar(`${m.lugares} lugares${m.area ? ` · ${m.area}` : ""}`, 72),
  }));
  const mais = mesas.length > itens.length ? ` (mostrando ${itens.length} de ${mesas.length})` : "";
  return {
    itens,
    mensagem: { tipo: "lista", corpo: `Estas mesas estão livres para ${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"}${mais}. Qual você prefere?`, rotuloBotao: "Escolher mesa", itens },
  };
}

export const mesaOcupada = (): string => "Essa mesa acabou de ser reservada por outra pessoa. Vou mostrar as que ainda estão livres.";

export const opcaoInvalida = (): string => "Não encontrei essa opção. Toque em uma das opções ou responda com o número dela.";

export const pedirNome = (): Mensagem => texto("Em nome de quem fica a reserva?");

export const nomeInvalido = (): string => "Preciso do nome para a reserva, com pelo menos 2 letras.";

export const pedirObservacoes = (): Mensagem =>
  botoes("Alguma observação para a equipe? (por exemplo, uma comemoração). Se não tiver, toque em *Sem observações*.", [{ id: "sem_obs", titulo: "Sem observações" }]);

/** Linhas com as regras da edição. Só entra o que está cadastrado; nada é presumido. */
export function linhasDeRegras(r: RegrasEdicao, horarioEvento: string): string[] {
  const linhas: string[] = [];
  if (r.abertura) linhas.push(`A casa abre às ${r.abertura}; o evento começa às ${horarioEvento}.`);
  if (r.tolerancia_min !== null) linhas.push(`Tolerância de ${r.tolerancia_min} minutos.`);
  if (r.consumacao_minima_centavos !== null) {
    linhas.push(r.consumacao_minima_centavos === 0 ? "Sem consumação mínima." : `Consumação mínima: ${formatarReais(r.consumacao_minima_centavos)}.`);
  }
  if (r.preco_centavos !== null) linhas.push(`Valor: ${formatarReais(r.preco_centavos)}.`);
  if (r.cancelamento_ate_horas !== null) linhas.push(`Cancelamento até ${r.cancelamento_ate_horas} ${r.cancelamento_ate_horas === 1 ? "hora" : "horas"} antes.`);
  return linhas;
}

export function resumo(p: { edicao: EdicaoOferecida; mesaNumero: string; mesaLugares?: number; pessoas: number; nome: string; observacoes: string }): Mensagem {
  const linhas = [
    "Confira sua reserva:",
    `• ${cap(formatData(p.edicao.data, "longa"))}, no ${LOCAL}`,
    `• Mesa ${p.mesaNumero}${p.mesaLugares ? ` (${p.mesaLugares} lugares)` : ""}`,
    `• ${p.pessoas} ${p.pessoas === 1 ? "pessoa" : "pessoas"}`,
    `• Em nome de: ${p.nome}`,
    ...(p.observacoes ? [`• Observações: ${p.observacoes}`] : []),
    "",
    ...linhasDeRegras(p.edicao.regras, p.edicao.horario),
    "",
    "Posso confirmar?",
  ];
  return botoes(linhas.join("\n"), [
    { id: "confirmar", titulo: "Confirmar" },
    { id: "alterar_pedido", titulo: "Alterar" },
    { id: "cancelar_fluxo", titulo: "Cancelar" },
  ]);
}

export function confirmada(p: { codigo: string; mesaNumero: string; pessoas: number; edicao: EdicaoOferecida }): Mensagem {
  const chegada = p.edicao.regras.instrucoes_chegada;
  return texto(
    [
      `Reserva confirmada! Seu código é *${p.codigo}*.`,
      `Mesa ${p.mesaNumero} para ${p.pessoas} ${p.pessoas === 1 ? "pessoa" : "pessoas"}, ${formatData(p.edicao.data, "longa")}, no ${LOCAL}.`,
      ...(chegada ? [chegada] : []),
      site.assinatura,
    ].join("\n"),
  );
}

export const fluxoCancelado = (): string => "Tudo bem, não fiz nenhuma reserva.";

export const semReservas = (): string => "Não encontrei reservas ativas para este número.";

export function listarReservas(rs: ReservaResumo[]): string {
  return ["Suas reservas:", ...rs.map((r) => `• ${r.codigo}: ${formatData(r.data, "curta")}, mesa ${r.mesaNumero}, ${r.pessoas} ${r.pessoas === 1 ? "pessoa" : "pessoas"} (${r.status === "confirmada" ? "confirmada" : "aguardando confirmação"})`)].join("\n");
}

export function escolherReserva(rs: ReservaResumo[], acao: "cancelar" | "alterar"): { mensagem: Mensagem; itens: ItemLista[] } {
  const itens: ItemLista[] = rs.slice(0, 10).map((r) => ({
    id: `res:${r.id}`,
    titulo: r.codigo,
    descricao: cortar(`${formatData(r.data, "curta")} · mesa ${r.mesaNumero} · ${r.pessoas} ${r.pessoas === 1 ? "pessoa" : "pessoas"}`, 72),
  }));
  return { itens, mensagem: { tipo: "lista", corpo: `Qual reserva você quer ${acao === "cancelar" ? "cancelar" : "alterar"}?`, rotuloBotao: "Escolher reserva", itens } };
}

export const confirmarCancelamento = (r: ReservaResumo): Mensagem =>
  botoes(`Cancelar a reserva ${r.codigo} (${formatData(r.data, "curta")}, mesa ${r.mesaNumero})?`, [
    { id: "cancelar_sim", titulo: "Sim, cancelar" },
    { id: "cancelar_nao", titulo: "Manter reserva" },
  ]);

export const reservaCancelada = (codigo: string): string => `Reserva ${codigo} cancelada. A mesa volta a ficar disponível.`;

export const reservaMantida = (): string => "Certo, mantive a reserva.";

export const reservaNaoEncontrada = (): string => "Não encontrei essa reserva. Ela pode já ter sido cancelada.";

export const escolherCampoAlteracao = (r: ReservaResumo): Mensagem =>
  botoes(`O que você quer alterar na reserva ${r.codigo}?`, [
    { id: "campo_nome", titulo: "Alterar nome" },
    { id: "campo_obs", titulo: "Alterar observações" },
    { id: "campo_outro", titulo: "Outra mudança" },
  ]);

export const pedirNovoValor = (campo: "nome" | "observacoes"): Mensagem =>
  texto(campo === "nome" ? "Qual o novo nome para a reserva?" : "Qual a nova observação? Se quiser remover, responda *nenhuma*.");

export const reservaAtualizada = (codigo: string): string => `Pronto, atualizei a reserva ${codigo}.`;

export const erroTecnico = (): Mensagem => texto("Tive um problema aqui. Vou chamar a equipe para te ajudar.");

export const semEdicaoPronta = (): Mensagem =>
  texto(`No momento não consigo confirmar reservas por aqui. Vou chamar a equipe da ${site.nome} para te atender.`);

/** "quinta-feira, 8 de outubro" -> "Quinta-feira, 8 de outubro". */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
