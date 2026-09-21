/**
 * Tipos e validação de mesas e reservas — sem acesso ao banco.
 * Seguro para componentes client; as rotas de API usam as mesmas regras.
 */

export type Mesa = {
  id: string;
  numero: string;
  lugares: number;
  area: string;
  x: number; // % da largura do mapa (centro da mesa)
  y: number; // % da altura do mapa
  ativa: boolean;
};

/** O que o site público recebe de cada mesa. */
export type MesaPublica = Omit<Mesa, "ativa">;

/**
 * aguardando: pedido feito, esperando o cliente mandar o código pelo WhatsApp (segura a mesa até expira_em)
 * confirmada: código recebido do mesmo número informado (ou confirmada à mão no painel)
 * expirada:   o prazo passou sem mensagem — a mesa voltou a ficar livre
 * cancelada:  cancelada pela equipe
 */
export type StatusReserva = "aguardando" | "confirmada" | "expirada" | "cancelada";

export type Reserva = {
  id: string;
  edicao_id: string;
  mesa_id: string;
  nome: string;
  whatsapp: string;
  pessoas: number;
  status: StatusReserva;
  codigo: string | null;
  expira_em: string | null;
  created_at: string;
};

export const STATUS_RESERVA: readonly StatusReserva[] = ["aguardando", "confirmada", "expirada", "cancelada"];
/** Status que seguram a mesa: com um deles, ninguém mais consegue pedir a mesma mesa na edição. */
export const STATUS_OCUPA_MESA: readonly StatusReserva[] = ["aguardando", "confirmada"];

/** Tempo que o cliente tem para mandar o código pelo WhatsApp. */
export const PRAZO_CONFIRMACAO_MIN = 15;

/** "QH-482193" em qualquer lugar da mensagem (maiúscula ou minúscula, com ou sem hífen). */
export const CODIGO_RE = /QH-?(\d{6})/i;

export const mensagemConfirmacao = (codigo: string) => `Quero confirmar minha reserva na QUINTA HITS. Código: ${codigo}`;

/**
 * O remetente do WhatsApp é o celular informado no site?
 * `remetente` vem da Meta (só dígitos, com país); `informado` é o salvo na reserva (11 dígitos, já normalizado).
 * Só aceita remetente brasileiro (55): sem isso, um número estrangeiro cujos dígitos imitam DDD + número
 * confirmaria uma reserva feita com celular brasileiro inventado.
 * A Meta às vezes entrega celular brasileiro sem o 9 extra (55 34 9999-8888), por isso compara DDD + últimos 8 dígitos.
 */
export function mesmoWhatsapp(remetente: string, informado: string): boolean {
  if (!/^55\d{10,11}$/.test(remetente) || !/^\d{11}$/.test(informado)) return false;
  const local = remetente.slice(2);
  return local.slice(0, 2) === informado.slice(0, 2) && local.slice(-8) === informado.slice(-8);
}

export const ehStatusReserva = (v: unknown): v is StatusReserva =>
  typeof v === "string" && (STATUS_RESERVA as readonly string[]).includes(v);

/** Máximo de pedidos ativos do mesmo WhatsApp numa edição (freio contra alguém segurar a casa inteira). */
export const MAX_RESERVAS_POR_WHATSAPP = 2;

/**
 * Celular brasileiro, só dígitos: DDD + 9 + 8 dígitos (com ou sem 55 na frente). Retorna null se não for.
 * Formato único e estrito: é ele que impede o mesmo aparelho de passar por "números diferentes"
 * (34 1234-5678, 34 01234-5678…) para furar o limite de reservas por WhatsApp.
 */
export function normalizarWhatsapp(v: unknown): string | null {
  if (typeof v !== "string") return null;
  let d = v.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  return /^[1-9]{2}9\d{8}$/.test(d) ? d : null;
}

/** "34999998888" -> "(34) 99999-8888" */
export function formatarWhatsapp(d: string): string {
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

export function inteiroEntre(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** Posição no mapa, 0–100, arredondada a 1 casa. */
export function posicaoValida(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v * 10) / 10 : null;
}
