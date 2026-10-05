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
  /** Liberação explícita da edição para reservas pelo site (coluna da migração parte 2; ausente = false). */
  reservas_site: boolean;
  observacoes: string;
};

export const CAMPOS_REGRAS = [
  "abertura", "reservas_ate", "tolerancia_min", "cancelamento_ate_horas", "capacidade_maxima",
  "consumacao_minima_centavos", "preco_centavos", "sinal_centavos", "instrucoes_chegada", "atendimento_automatico", "reservas_site", "observacoes",
] as const satisfies readonly (keyof RegrasEdicao)[];

/** Campos que existem desde a migração parte 1 (o banco atual pode ainda não ter a coluna `reservas_site`). */
export const CAMPOS_REGRAS_PARTE1 = CAMPOS_REGRAS.filter((c) => c !== "reservas_site");

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
  reservas_site: false,
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
  for (const campo of ["atendimento_automatico", "reservas_site"] as const) {
    if (!(campo in b)) continue;
    if (typeof b[campo] !== "boolean") return { erro: `Campo "${campo}" inválido.` };
    campos[campo] = b[campo] as boolean;
  }
  return { campos };
}

/**
 * Prontidão de uma edição. `abreEm` (só no site) aparece quando a edição está com tudo pronto, mas aguardando o dia e a
 * hora da abertura semanal das reservas: é o instante (ISO) em que ela abre sozinha.
 */
export type Prontidao = { pronta: boolean; faltando: string[]; abreEm?: string; abreQuando?: string };

/**
 * Abertura semanal das reservas pelo SITE, padrão da casa (site_config): as reservas de cada edição abrem no `dia` da
 * semana (0 = domingo … 6 = sábado) mais recente até a data da edição, no `hora` ("12h" ou "12h30"), horário de Uberlândia.
 * Ex.: segunda às 12h para uma quinta = a segunda da mesma semana, 3 dias antes. null = sem dia fixo (abre assim que completa).
 */
export type AberturaSemanal = { dia: number; hora: string };

export const DIAS_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;

/** Valida dia/hora vindos do banco; qualquer coisa fora do formato = sem regra (não inventa abertura). */
export function aberturaSemanalDe(dia: unknown, hora: unknown): AberturaSemanal | null {
  if (typeof dia !== "number" || !Number.isInteger(dia) || dia < 0 || dia > 6) return null;
  if (typeof hora !== "string" || !HORARIO_RE.test(hora.trim())) return null;
  return { dia, hora: hora.trim() };
}

/** Data (AAAA-MM-DD) em que as reservas da edição abrem: o `dia` da semana mais recente até a data da edição. */
export function dataDeAbertura(dataEdicao: string, regra: AberturaSemanal): string {
  const [a, m, d] = dataEdicao.split("-").map(Number);
  const diaDaEdicao = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  const recuo = (diaDaEdicao - regra.dia + 7) % 7;
  return new Date(Date.UTC(a, m - 1, d - recuo)).toISOString().slice(0, 10);
}

/** Instante em que as reservas da edição abrem (Uberlândia = UTC-3, sem horário de verão). */
export function inicioDasReservas(dataEdicao: string, regra: AberturaSemanal): Date {
  const m = HORARIO_RE.exec(regra.hora) ?? [];
  const hora = (m[1] ?? "0").padStart(2, "0");
  const minuto = m[2] ?? "00";
  return new Date(`${dataDeAbertura(dataEdicao, regra)}T${hora}:${minuto}:00-03:00`);
}

/** "segunda, 05/10, às 12h" — para o painel e para a página de reserva. */
export function descreverAbertura(dataEdicao: string, regra: AberturaSemanal): string {
  const data = dataDeAbertura(dataEdicao, regra);
  return `${DIAS_DA_SEMANA[regra.dia]}, ${data.slice(8, 10)}/${data.slice(5, 7)}, às ${regra.hora}`;
}

/**
 * A edição está pronta para o atendimento automático? Todos os itens abaixo precisam existir; um só faltando
 * = o agente NÃO informa disponibilidade, NÃO confirma nada e repassa para uma pessoa.
 */
export function avaliarProntidao(entrada: { edicao: Edicao | null; regras: RegrasEdicao | null; mesasWhatsapp: number; agora?: Date }): Prontidao {
  const { edicao, regras, mesasWhatsapp } = entrada;
  const faltando = faltandoDaEdicao(edicao, regras, entrada.agora ?? new Date());
  if (!edicao) return { pronta: false, faltando };
  if (mesasWhatsapp < 1) faltando.push("ao menos uma mesa liberada para o WhatsApp");
  if (!(regras ?? REGRAS_VAZIAS).atendimento_automatico) faltando.push("liberação da edição para o atendimento automático");
  return { pronta: faltando.length === 0, faltando };
}

/**
 * A edição está pronta para reservas pelo SITE? Mesmas exigências de dados do agente, mais a liberação EXPLÍCITA
 * para o site (`reservas_site`) e ao menos uma mesa oferecida ao site. Um só item faltando = o site NÃO aceita reserva.
 */
export function avaliarProntidaoDoSite(entrada: {
  edicao: Edicao | null;
  regras: RegrasEdicao | null;
  mesasSite: number;
  agora?: Date;
  /** Padrão da casa; ausente/null = sem dia fixo (abre assim que a edição estiver completa). */
  aberturaSemanal?: AberturaSemanal | null;
}): Prontidao {
  const { edicao, regras, mesasSite, aberturaSemanal } = entrada;
  const agora = entrada.agora ?? new Date();
  const faltando = faltandoDaEdicao(edicao, regras, agora);
  if (!edicao) return { pronta: false, faltando };
  if (mesasSite < 1) faltando.push("ao menos uma mesa oferecida ao site");
  if (!(regras ?? REGRAS_VAZIAS).reservas_site) faltando.push("liberação da edição para reservas pelo site");
  if (aberturaSemanal) {
    const inicio = inicioDasReservas(edicao.data, aberturaSemanal);
    // `!(>=)`: uma data inválida (NaN) fica FECHADA, nunca aberta por engano.
    if (!(agora.getTime() >= inicio.getTime())) {
      const abreQuando = descreverAbertura(edicao.data, aberturaSemanal);
      faltando.push(`abertura das reservas (${abreQuando})`);
      return { pronta: false, faltando, abreEm: inicio.toISOString(), abreQuando };
    }
  }
  return { pronta: faltando.length === 0, faltando };
}

/** Pronta em tudo e só esperando o dia/hora da abertura semanal? */
export const soAguardaAbertura = (p: Prontidao) => !p.pronta && !!p.abreEm && p.faltando.length === 1;

/** Exigências de dados comuns ao site e ao agente. Devolve exatamente o que falta (lista vazia = completo). */
function faltandoDaEdicao(edicao: Edicao | null, regras: RegrasEdicao | null, agora: Date): string[] {
  const faltando: string[] = [];
  if (!edicao) return ["edição não encontrada"];
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
  return faltando;
}

/** A edição já tem alguma regra preenchida (serve de modelo para "copiar regras da quinta anterior")? */
export const temRegras = (r: RegrasEdicao) =>
  [r.abertura, r.reservas_ate, r.tolerancia_min, r.cancelamento_ate_horas, r.capacidade_maxima, r.consumacao_minima_centavos, r.preco_centavos, r.sinal_centavos, r.instrucoes_chegada].some((v) => v !== null);

/**
 * Regras de outra edição trazidas para esta: tudo igual, o prazo final para reservar andando junto com a data (mesmo
 * horário, tantos dias depois) e as observações internas DESTA edição preservadas. Só preenche o formulário: nada é salvo.
 */
export function regrasCopiadas(modelo: RegrasEdicao, dataModelo: string, dataDestino: string, observacoes: string): RegrasEdicao {
  const dias = Math.round((Date.parse(`${dataDestino}T12:00:00Z`) - Date.parse(`${dataModelo}T12:00:00Z`)) / 86_400_000);
  return {
    ...modelo,
    reservas_ate: modelo.reservas_ate ? new Date(new Date(modelo.reservas_ate).getTime() + dias * 86_400_000).toISOString() : null,
    observacoes,
  };
}

/** O que o CLIENTE pode ver das regras da edição (nada interno: sem sinal e sem observações). */
export type RegrasPublicas = Pick<RegrasEdicao, "abertura" | "reservas_ate" | "tolerancia_min" | "cancelamento_ate_horas" | "consumacao_minima_centavos" | "preco_centavos" | "instrucoes_chegada">;

export const regrasPublicas = (r: RegrasEdicao): RegrasPublicas => ({
  abertura: r.abertura,
  reservas_ate: r.reservas_ate,
  tolerancia_min: r.tolerancia_min,
  cancelamento_ate_horas: r.cancelamento_ate_horas,
  consumacao_minima_centavos: r.consumacao_minima_centavos,
  preco_centavos: r.preco_centavos,
  instrucoes_chegada: r.instrucoes_chegada,
});

/** "R$ 50,00" a partir de centavos. */
export const formatarReais = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace(".", ",")}`;
