import "server-only";
import type { EventoMensagem, EventoStatus } from "@/lib/whatsappEventos";
import { edicoesProntasParaAgente } from "@/lib/regras";
import { mesasLivres } from "@/lib/disponibilidade";
import { agenteLigadoPorEnv, ambienteAtual, envioLigadoPorEnv, repasseHumanoLigadoPorEnv } from "./ambiente";
import { decidirAgente } from "./ativacao";
import { abrirTransferencia } from "./atendimento";
import { registrarEventoWebhook } from "./eventos";
import { enfileirar } from "./fila";
import { textoDaMensagem } from "./graph";
import { avancar } from "./maquina";
import { atualizarReservaDoContato, cancelarReservaDoContato, criarReservaDoAgente, reservasDoContato } from "./reservas";
import {
  aplicarStatusDeEntrega, contarEntradasNaUltimaHora, gravarMensagem, obterConfig, obterOuAbrirConversa, obterOuCriarContato, salvarConversa,
  type Contato, type PatchConversa,
} from "./repositorio";
import type { EntradaCliente, Mensagem, Passo, Portas } from "./tipos";

/**
 * ORQUESTRADOR do agente: recebe um evento de mensagem do número da QUINTA HITS e conduz tudo, na ordem certa:
 * interruptores → idempotência → contato → conversa → registro da mensagem → limites → máquina de estados →
 * gravação do novo estado (com trava otimista) → fila de saída → transferência para humano.
 *
 * Só as respostas são ENFILEIRADAS aqui; o envio real é outro passo (fila) e continua desligado por padrão.
 */

export type ResultadoAgente = "desligado" | "sem_migracao" | "duplicado" | "bloqueado" | "limitado" | "humano" | "processado" | "conflito";

const TENTATIVAS_DE_CONFLITO = 3;
const FALLBACK_SEM_REPASSE: Mensagem = { tipo: "texto", corpo: "No momento não consigo continuar o atendimento por aqui. Tente novamente mais tarde." };

function entradaDoCliente(ev: EventoMensagem): EntradaCliente {
  const c = ev.conteudo;
  if (c.forma === "texto") return { forma: "texto", texto: c.texto };
  if (c.forma === "resposta_interativa") return { forma: "interativa", id: c.id, texto: c.titulo };
  return { forma: "nao_suportado" };
}

function portasReais(contato: Contato, agora: Date): Portas {
  return {
    agora: () => agora,
    edicoesProntas: async () => (await edicoesProntasParaAgente(agora)).map((p) => ({ id: p.edicao.id, data: p.edicao.data, artista: p.edicao.artista, horario: p.edicao.horario, regras: p.regras })),
    mesasLivres: async (edicaoId, pessoas) => (await mesasLivres(edicaoId, "whatsapp", pessoas)).map((m) => ({ id: m.id, numero: m.numero, lugares: m.lugares, area: m.area })),
    criarReserva: (p) => criarReservaDoAgente({ contato, ...p }),
    reservasDoContato: () => reservasDoContato(contato, agora),
    cancelarReserva: (id) => cancelarReservaDoContato(contato, id, agora),
    atualizarReserva: (id, campos) => atualizarReservaDoContato(contato, id, campos, agora),
  };
}

const tipoDaMensagem = (ev: EventoMensagem) => (ev.conteudo.forma === "texto" ? "text" : ev.conteudo.forma === "resposta_interativa" ? "interactive" : ev.conteudo.tipoMeta);
const textoDoCliente = (ev: EventoMensagem) => (ev.conteudo.forma === "texto" ? ev.conteudo.texto : ev.conteudo.forma === "resposta_interativa" ? ev.conteudo.titulo || ev.conteudo.id : `[${ev.conteudo.tipoMeta}]`);

/** Trata uma mensagem recebida no número da QUINTA HITS pelo agente. `desligado`/`sem_migracao` = o fluxo atual segue como sempre. */
export async function tratarMensagemDoAgente(ev: EventoMensagem, o: { agora?: Date; portas?: (contato: Contato) => Portas } = {}): Promise<ResultadoAgente> {
  const agora = o.agora ?? new Date();
  if (!agenteLigadoPorEnv()) return "desligado";
  const config = await obterConfig();
  if (!config) return "sem_migracao";
  const decisao = decidirAgente({ envAgente: true, envEnvio: envioLigadoPorEnv(), ambienteApp: ambienteAtual() }, config, ev.de);
  if (!decisao.ativo) return "desligado";

  // Idempotência: a Meta reentrega; cada mensagem é processada uma única vez.
  const registro = await registrarEventoWebhook({ id: ev.wamid, tipo: "message", phoneNumberId: ev.phoneNumberId, destino: "quinta_hits" });
  if (registro === "repetido") return "duplicado";
  if (registro === "indisponivel" && ev.wamid) return "sem_migracao";

  const contato = await obterOuCriarContato(ev.de, ev.nomePerfil);
  if (contato.bloqueado) return "bloqueado";

  const primeira = await obterOuAbrirConversa(contato.id);
  const idMensagem = await gravarMensagem({ wamid: ev.wamid || null, conversaId: primeira.id, direcao: "entrada", autor: "cliente", tipo: tipoDaMensagem(ev), conteudo: textoDoCliente(ev), status: "recebida" });
  if (idMensagem === null) return "duplicado";
  if ((await contarEntradasNaUltimaHora(primeira.id, agora)) > config.limite_entradas_por_contato_hora) return "limitado";

  const quando = new Date(ev.enviadaEm).toISOString();
  const transferenciaHabilitada = repasseHumanoLigadoPorEnv() && config.transferencia_humana_ativa;

  for (let tentativa = 0; tentativa < TENTATIVAS_DE_CONFLITO; tentativa++) {
    const conversa = tentativa === 0 ? primeira : await obterOuAbrirConversa(contato.id);

    // Conversa com uma pessoa: o agente NÃO responde; só registra a atividade.
    if (conversa.status !== "agente") {
      if (await salvarConversa(conversa, { ultima_msg_cliente_em: quando })) return "humano";
      continue;
    }

    let passo: Passo;
    if (!contato.telefone) {
      passo = { estado: "WAITING_HUMAN", contexto: {}, mensagens: [{ tipo: "texto", corpo: "Certo! Vou chamar alguém da equipe da QUINTA HITS para continuar com você por aqui." }], tentativasSemEntender: 0, transferir: { motivo: "numero_nao_brasileiro", detalhe: "O agente só reserva para celular brasileiro." } };
    } else if (contato.preferencia_atendimento === "humano") {
      passo = { estado: "WAITING_HUMAN", contexto: {}, mensagens: [], tentativasSemEntender: 0, transferir: { motivo: "pedido_do_cliente", detalhe: "Contato marcado para atendimento humano." } };
    } else {
      passo = await avancar(
        { estado: conversa.estado, contexto: conversa.contexto, tentativasSemEntender: conversa.tentativas_sem_entender, atualizadoEm: conversa.updated_at },
        entradaDoCliente(ev),
        (o.portas ?? ((c) => portasReais(c, agora)))(contato),
      );
    }

    // Transferência desligada: não há para quem passar; avisa e encerra em vez de prometer atendimento.
    let patch: PatchConversa;
    if (passo.transferir && !transferenciaHabilitada) {
      passo = { ...passo, transferir: undefined, mensagens: [FALLBACK_SEM_REPASSE], estado: "CLOSED" };
      patch = { estado: "CLOSED", status: "encerrada", encerrada_em: new Date().toISOString(), contexto: {}, tentativas_sem_entender: 0, ultima_msg_cliente_em: quando };
    } else if (passo.transferir) {
      patch = { estado: "WAITING_HUMAN", status: "aguardando_humano", contexto: passo.contexto, tentativas_sem_entender: 0, ultima_msg_cliente_em: quando };
    } else {
      patch = { estado: passo.estado, contexto: passo.contexto, tentativas_sem_entender: passo.tentativasSemEntender, ultima_msg_cliente_em: quando };
    }

    // Trava otimista: se outra mensagem do mesmo cliente mudou a conversa, refaz com o estado novo (sem enfileirar nada antes).
    const salvo = await salvarConversa(conversa, patch);
    if (!salvo) continue;

    for (const [i, mensagem] of passo.mensagens.entries()) {
      const mensagemId = await gravarMensagem({ conversaId: conversa.id, direcao: "saida", autor: "agente", tipo: mensagem.tipo === "texto" ? "text" : "interactive", conteudo: textoDaMensagem(mensagem), status: "na_fila" });
      await enfileirar({ conversaId: conversa.id, mensagemId, para: contato.wa_id, mensagem, chave: `${conversa.id}:${ev.wamid || quando}:${i}` });
    }
    if (passo.transferir) await abrirTransferencia(conversa.id, passo.transferir.motivo, passo.transferir.detalhe);
    return "processado";
  }
  return "conflito";
}

/** Atualização de entrega (enviada, entregue, lida, falhou) das mensagens do agente. Só com o agente ligado por variável. */
export async function tratarStatusDoAgente(ev: EventoStatus): Promise<void> {
  if (!agenteLigadoPorEnv()) return;
  if (!(await obterConfig())) return;
  const registro = await registrarEventoWebhook({ id: `${ev.wamid}:${ev.status}`, tipo: "status", phoneNumberId: ev.phoneNumberId, destino: "quinta_hits" });
  if (registro !== "novo") return;
  await aplicarStatusDeEntrega(ev.wamid, ev.status, ev.erroCodigo);
}
