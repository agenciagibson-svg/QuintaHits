import type { RegrasEdicao } from "@/lib/regrasEdicao";

/** Tipos compartilhados do agente (só declarações; sem código, sem banco). */

export const ESTADOS = [
  "NEW", "WELCOME", "SELECTING_EVENT", "ASKING_GUEST_COUNT", "CHECKING_AVAILABILITY", "SELECTING_TABLE",
  "COLLECTING_NAME", "COLLECTING_NOTES", "REVIEWING_RESERVATION", "CONFIRMED", "ALTERING_RESERVATION",
  "CANCELLING_RESERVATION", "WAITING_HUMAN", "CLOSED",
] as const;
export type EstadoConversa = (typeof ESTADOS)[number];

export type MotivoTransferencia =
  | "pedido_do_cliente" | "reclamacao" | "disponibilidade_indefinida" | "edicao_nao_pronta" | "nao_entendeu"
  | "fora_do_fluxo" | "erro_tecnico" | "excecao_de_reserva" | "pagamento_ou_estorno" | "numero_nao_brasileiro" | "outro";

export type OpcaoOferecida = { id: string; rotulo: string };

/** Memória da conversa. Nunca guarda segredos. */
export type Contexto = {
  edicaoId?: string;
  pessoas?: number;
  mesaId?: string;
  mesaNumero?: string;
  mesaLugares?: number;
  nome?: string;
  observacoes?: string;
  /** Últimas opções mostradas: permite responder com o número em vez de tocar no botão. */
  opcoes?: OpcaoOferecida[];
  /** Cancelamento e alteração de reserva existente. */
  reservaId?: string;
  passo?: "escolher" | "confirmar" | "campo" | "valor";
  campo?: "nome" | "observacoes";
};

/** O que o cliente mandou, já reduzido ao essencial. */
export type EntradaCliente =
  | { forma: "texto"; texto: string }
  | { forma: "interativa"; id: string; texto: string }
  | { forma: "nao_suportado" };

export type Botao = { id: string; titulo: string };
export type ItemLista = { id: string; titulo: string; descricao?: string };

/** O que o agente responde. O envio transforma isso em texto, botões ou lista da Cloud API. */
export type Mensagem =
  | { tipo: "texto"; corpo: string }
  | { tipo: "botoes"; corpo: string; botoes: Botao[] }
  | { tipo: "lista"; corpo: string; rotuloBotao: string; itens: ItemLista[] };

export type PedidoTransferencia = { motivo: MotivoTransferencia; detalhe: string };

export type Passo = {
  estado: EstadoConversa;
  contexto: Contexto;
  mensagens: Mensagem[];
  tentativasSemEntender: number;
  transferir?: PedidoTransferencia;
};

export type EdicaoOferecida = {
  id: string;
  data: string;
  artista: string;
  /** Horário do evento (edicoes.horario), já garantido pela prontidão. */
  horario: string;
  regras: RegrasEdicao;
};

export type MesaOferecida = { id: string; numero: string; lugares: number; area: string };

export type ReservaResumo = {
  id: string;
  codigo: string;
  edicaoId: string;
  data: string;
  horario: string;
  mesaNumero: string;
  pessoas: number;
  nome: string;
  observacoes: string;
  status: "aguardando" | "confirmada";
};

export type ResultadoCriacao =
  | { ok: true; codigo: string; mesaNumero: string }
  | { ok: false; motivo: "mesa_indisponivel" | "limite_por_whatsapp" | "edicao_fechada" | "nao_pronta" | "erro" };

export type ResultadoCancelamento = "ok" | "nao_encontrada" | "fora_do_prazo" | "regra_indefinida" | "erro";

/** Tudo que a máquina precisa do mundo de fora. Nos testes e na demonstração são substituídas por versões em memória. */
export type Portas = {
  agora(): Date;
  edicoesProntas(): Promise<EdicaoOferecida[]>;
  mesasLivres(edicaoId: string, pessoas: number): Promise<MesaOferecida[]>;
  criarReserva(p: { edicaoId: string; mesaId: string; pessoas: number; nome: string; observacoes: string }): Promise<ResultadoCriacao>;
  reservasDoContato(): Promise<ReservaResumo[]>;
  cancelarReserva(reservaId: string): Promise<ResultadoCancelamento>;
  atualizarReserva(reservaId: string, campos: { nome?: string; observacoes?: string }): Promise<boolean>;
};

export type ConversaParaMaquina = {
  estado: EstadoConversa;
  contexto: Contexto;
  tentativasSemEntender: number;
  /** Última atividade (ISO); acima de 24 h a conversa recomeça. */
  atualizadoEm: string;
};
