import { HORARIO_RE, hojeISO, type Edicao } from "@/lib/edicao";

/**
 * Regras de reserva POR EDIÇÃO (tabela edicoes_regras) e a "prontidão" da edição para o atendimento automático.
 * Sem acesso a banco: seguro para o painel (client) e para os testes.
 *
 * REGRA DO PROJETO: nenhum valor é inventado. Campo vazio (null) = "ainda não definido". Nada aqui tem valor padrão
 * operacional (horário, tolerância, consumação, prazo...): o agente só atende uma edição cujas regras estejam completas.
 */
export type RegrasEdicao = {
  /** Horário de abertura da casa: "19h" ou "19h30". */
  abertura: string | null;
  /** Prazo final para reservar (instante ISO). */
  reservas_ate: string | null;
  tolerancia_min: number | null;
  cancelamento_ate_horas: number | null;
  capacidade_maxima: number | null;
  /** 0 = sem consumação mínima; null = ainda não definido. */
  consumacao_minima_centavos: number | null;
  preco_centavos: number | null;
  /** Só informativo: pagamento segue desligado na fase 1. */
  sinal_centavos: number | null;
  instrucoes_chegada: string | null;
  /** Liberação explícita da edição para o atendimento automático. */
  atendimento_automatico: boolean;
  observacoes: string;
};

export const CAMPOS_REGRAS = [
  "abertura", "reservas_ate", "tolerancia_min", "cancelamento_ate_horas", "capacidade_maxima",
  "consumacao_minima_centavos", "preco_centavos", "sinal_centavos", "instrucoes_chegada", "atendimento_automatico", "observacoes",
] as const satisfies readonly (keyof RegrasEdicao)[];

export const REGRAS_VAZIAS: RegrasEdicao = {
  abertura: null,
  reservas_ate: null,
  tolerancia_min: null,
  cancelamento_ate_horas: null,
  capacidade_maxima: null,
  consumacao_minima_centavos: null,
  preco_centavos: null,
  sinal_centavos: null,
  instrucoes_chegada: null,
  atendimento_automatico: false,
  observacoes: "",
};

type Resultado = { erro: string } | { campos: Partial<RegrasEdicao> };

const vazio = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

function inteiro(v: unknown, min: number, max: number, rotulo: string): { valor: number | null } | { erro: string } {
  if (vazio(v)) return { valor: null };
  const n = typeof v === "string" ? Number(v.trim().replace(",", ".")) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) return { erro: `${rotulo} precisa ser um número inteiro de ${min} a ${max}.` };
  return { valor: n };
}

/** Valida o que veio do painel. Campo ausente = não muda; vazio = volta a "não definido". */
export function validarRegras(body: unknown): Resultado {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { erro: "Regras inválidas." };
  const b = body as Record<string, unknown>;
  const campos: Partial<RegrasEdicao> = {};

  if ("abertura" in b) {
    if (vazio(b.abertura)) campos.abertura = null;
    else if (typeof b.abertura === "string" && HORARIO_RE.test(b.abertura.trim())) campos.abertura = b.abertura.trim();
    else return { erro: 'Horário de abertura no formato "19h" ou "19h30".' };
  }
  if ("reservas_ate" in b) {
    if (vazio(b.reservas_ate)) campos.reservas_ate = null;
    else {
      const d = typeof b.reservas_ate === "string" ? new Date(b.reservas_ate) : null;
      if (!d || Number.isNaN(d.getTime())) return { erro: "Prazo final para reservar inválido." };
      campos.reservas_ate = d.toISOString();
    }
  }
  const numericos: [keyof RegrasEdicao, number, number, string][] = [
    ["tolerancia_min", 0, 600, "Tolerância (minutos)"],
    ["cancelamento_ate_horas", 0, 720, "Prazo de cancelamento (horas)"],
    ["capacidade_maxima", 1, 100_000, "Capacidade máxima"],
    ["consumacao_minima_centavos", 0, 100_000_000, "Consumação mínima"],
    ["preco_centavos", 0, 100_000_000, "Preço"],
    ["sinal_centavos", 0, 100_000_000, "Sinal"],
  ];
  for (const [campo, min, max, rotulo] of numericos) {
    if (!(campo in b)) continue;
    const r = inteiro(b[campo], min, max, rotulo);
    if ("erro" in r) return r;
    (campos as Record<string, number | null>)[campo] = r.valor;
  }
  for (const [campo, limite] of [["instrucoes_chegada", 1000], ["observacoes", 500]] as const) {
    if (!(campo in b)) continue;
    const v = b[campo];
    if (vazio(v)) { (campos as Record<string, string | null>)[campo] = campo === "observacoes" ? "" : null; continue; }
    if (typeof v !== "string" || v.trim().length > limite) return { erro: `Texto de "${campo}" passa de ${limite} caracteres.` };
    (campos as Record<string, string | null>)[campo] = v.trim();
  }
  if ("atendimento_automatico" in b) {
    if (typeof b.atendimento_automatico !== "boolean") return { erro: 'Campo "atendimento_automatico" inválido.' };
    campos.atendimento_automatico = b.atendimento_automatico;
  }
  return { campos };
}

export type Prontidao = { pronta: boolean; faltando: string[] };

/**
 * A edição está pronta para o atendimento automático? Todos os itens abaixo precisam existir; um só faltando
 * = o agente NÃO informa disponibilidade, NÃO confirma nada e repassa para uma pessoa.
 */
export function avaliarProntidao(entrada: { edicao: Edicao | null; regras: RegrasEdicao | null; mesasWhatsapp: number; agora?: Date }): Prontidao {
  const { edicao, regras, mesasWhatsapp } = entrada;
  const agora = entrada.agora ?? new Date();
  const faltando: string[] = [];

  if (!edicao) return { pronta: false, faltando: ["edição não encontrada"] };
  if (edicao.data < hojeISO(agora)) faltando.push("edição que já passou");
  if (edicao.status !== "confirmada" && edicao.status !== "a_confirmar") faltando.push("edição cancelada ou já realizada");
  if (!edicao.horario || !HORARIO_RE.test(edicao.horario)) faltando.push("horário do evento");
  if (!edicao.local.trim()) faltando.push("local do evento");

  const r = regras ?? REGRAS_VAZIAS;
  if (!r.abertura) faltando.push("horário de abertura");
  if (!r.reservas_ate) faltando.push("prazo final para reservar");
  else if (new Date(r.reservas_ate).getTime() <= agora.getTime()) faltando.push("prazo final para reservar (já passou)");
  if (r.tolerancia_min === null) faltando.push("tolerância");
  if (r.cancelamento_ate_horas === null) faltando.push("prazo de cancelamento");
  if (r.capacidade_maxima === null) faltando.push("capacidade máxima");
  if (r.consumacao_minima_centavos === null) faltando.push("consumação mínima (use 0 se não houver)");
  if (!r.instrucoes_chegada) faltando.push("instruções de chegada");
  if (mesasWhatsapp < 1) faltando.push("ao menos uma mesa liberada para o WhatsApp");
  if (!r.atendimento_automatico) faltando.push("liberação da edição para o atendimento automático");

  return { pronta: faltando.length === 0, faltando };
}

/** "R$ 50,00" a partir de centavos. */
export const formatarReais = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace(".", ",")}`;
