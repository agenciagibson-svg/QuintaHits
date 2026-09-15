import { site } from "@/config/site";

/**
 * Tipos, rótulos e helpers de data das edições — sem acesso ao banco.
 * Seguro para componentes client; a busca no Supabase fica em lib/programacao.ts.
 */

export type Genero = "rock" | "pop-rock" | "hits" | "2000s" | "dj" | "mpb" | "special" | "";
export type Status = "realizada" | "confirmada" | "a_confirmar" | "cancelada";

export type Edicao = {
  id: string;
  data: string; // ISO YYYY-MM-DD
  artista: string;
  instagram: string;
  tema: string;
  genero: Genero;
  horario: string;
  local: string;
  status: Status;
  destaque: string;
};

export const GENEROS: Record<Exclude<Genero, "">, { rotulo: string; cor: "terracota" | "mostarda" | "preto" | "vazado" | "verde" }> = {
  rock: { rotulo: "ROCK", cor: "terracota" },
  "pop-rock": { rotulo: "ROCK POP", cor: "terracota" },
  hits: { rotulo: "HITS", cor: "verde" },
  "2000s": { rotulo: "2000'S", cor: "mostarda" },
  dj: { rotulo: "DJ VINYL", cor: "preto" },
  mpb: { rotulo: "MPB", cor: "verde" },
  special: { rotulo: "SPECIAL", cor: "vazado" },
};

export const GENERO_VALORES: readonly Genero[] = ["", ...(Object.keys(GENEROS) as Exclude<Genero, "">[])];
export const STATUS_VALORES: readonly Status[] = ["a_confirmar", "confirmada", "realizada", "cancelada"];

export const ehGenero = (v: unknown): v is Genero => typeof v === "string" && (GENERO_VALORES as readonly string[]).includes(v);
export const ehStatus = (v: unknown): v is Status => typeof v === "string" && (STATUS_VALORES as readonly string[]).includes(v);

/** Horário no formato "20h" ou "20h30". */
export const HORARIO_RE = /^([01]?\d|2[0-3])h([0-5]\d)?$/;

const TZ = "America/Sao_Paulo";

/** Data de hoje em Uberlândia (YYYY-MM-DD), independente do fuso do servidor. */
export function hojeISO(agora = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(agora);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** AAAA-MM-DD que existe no calendário. */
export function dataISOValida(iso: unknown): iso is string {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === iso;
}

/** Dia da semana (0 = domingo) da data ISO, tratada como data local de Uberlândia. */
export function diaSemana(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function ehQuinta(iso: string): boolean {
  return diaSemana(iso) === 4;
}

export function somaDias(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Próxima quinta-feira a partir de hoje (inclui hoje, se for quinta). */
export function proximaQuintaISO(agora = new Date()): string {
  let iso = hojeISO(agora);
  for (let i = 0; i < 7; i++) {
    if (ehQuinta(iso)) return iso;
    iso = somaDias(iso, 1);
  }
  return iso;
}

/**
 * Instante (UTC) em que uma edição começa em Uberlândia: no horário da edição, senão no
 * horário padrão ("20h"/"20h30"), senão às 00:00.
 */
export function inicioDaEdicao(iso: string, horario = "", horarioPadrao: string = site.horarioPadrao): Date {
  const m = HORARIO_RE.exec((horario || horarioPadrao).trim());
  const hora = (m?.[1] ?? "0").padStart(2, "0");
  const minuto = m?.[2] ?? "00";
  // Uberlândia = UTC-3 sem horário de verão
  return new Date(`${iso}T${hora}:${minuto}:00-03:00`);
}

/**
 * Hoje tem Quinta Hits? É quinta-feira em Uberlândia e a data não está cancelada.
 * Quinta sem registro nenhum conta como "tem" — a quinta é garantida, o line-up é que não.
 */
export function temEdicaoNoDia(agora: Date, datasCanceladas: readonly string[]): boolean {
  const hoje = hojeISO(agora);
  return ehQuinta(hoje) && !datasCanceladas.includes(hoje);
}

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export function mesCurto(iso: string): string {
  return MESES[Number(iso.split("-")[1]) - 1];
}

/** "17 SET" / "quinta-feira, 17 de setembro" / "17/09" */
export function formatData(iso: string, estilo: "curta" | "longa" | "numerica" = "curta"): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  if (estilo === "numerica") return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  if (estilo === "longa")
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(dt);
  return `${String(d).padStart(2, "0")} ${mesCurto(iso)}`;
}
