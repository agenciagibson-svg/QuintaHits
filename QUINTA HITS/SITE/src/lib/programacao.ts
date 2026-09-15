import dados from "@/data/programacao.json";
import { site } from "@/config/site";

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

const TZ = "America/Sao_Paulo";

/** Data de hoje em Uberlândia (YYYY-MM-DD), independente do fuso do servidor. */
export function hojeISO(agora = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(agora);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Dia da semana (0 = domingo) da data ISO, tratada como data local de Uberlândia. */
export function diaSemana(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function ehQuinta(iso: string): boolean {
  return diaSemana(iso) === 4;
}

function somaDias(iso: string, n: number): string {
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

/** Instante (UTC) em que uma edição começa em Uberlândia, às 00:00 ou no horário informado. */
export function inicioDaEdicao(iso: string, horario = ""): Date {
  const hora = /^(\d{1,2})h/.exec(horario || site.horarioPadrao)?.[1] ?? "0";
  // Uberlândia = UTC-3 sem horário de verão
  return new Date(`${iso}T${hora.padStart(2, "0")}:00:00-03:00`);
}

/**
 * Instante em que a PRÓXIMA EDIÇÃO começa — não a próxima quinta do calendário.
 * Se uma quinta está cancelada (ex.: 17/09 e 01/10 de 2026), a contagem pula para a seguinte.
 */
export function inicioProximaQuinta(agora = new Date()): Date {
  const e = proximaEdicao(agora);
  return inicioDaEdicao(e.data, e.horario);
}

/**
 * Hoje tem Quinta Hits? É quinta-feira em Uberlândia e a data não está cancelada.
 * Quinta sem registro nenhum conta como "tem" — a quinta é garantida, o line-up é que não.
 */
export function temEdicaoHoje(agora = new Date()): boolean {
  const hoje = hojeISO(agora);
  if (!ehQuinta(hoje)) return false;
  return !todasEdicoes().some((e) => e.data === hoje && e.status === "cancelada");
}

export function todasEdicoes(): Edicao[] {
  return (dados as Edicao[]).slice().sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Próximas edições. Se uma quinta não tiver nenhum registro, cria um placeholder "a confirmar".
 * Uma quinta com registro "cancelada" (ex.: não vai ter Quinta Hits naquela semana) é pulada:
 * não aparece na lista e também não vira placeholder — ela conta como "já tratada".
 */
export function proximasEdicoes(agora = new Date(), limite = 4): Edicao[] {
  const hoje = hojeISO(agora);
  const futuras = todasEdicoes().filter((e) => e.data >= hoje);
  const semCanceladas = futuras.filter((e) => e.status !== "cancelada");
  const temRegistro = (iso: string) => futuras.some((e) => e.data === iso);
  const proxQuinta = proximaQuintaISO(agora);
  const lista = temRegistro(proxQuinta) ? semCanceladas : [placeholder(proxQuinta), ...semCanceladas];
  // completa a lista com as quintas seguintes, sem nenhum registro, até o limite
  let cursor = proxQuinta;
  while (lista.length < limite) {
    cursor = somaDias(cursor, 7);
    if (!temRegistro(cursor)) lista.push(placeholder(cursor));
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data)).slice(0, limite);
}

/**
 * Edições que já aconteceram, da mais recente para a mais antiga.
 * Entra toda data passada que teve artista e não foi cancelada — mesmo que ninguém tenha
 * trocado o status para "realizada" depois da noite. Sem isso, a edição sumia do site:
 * saía de "próximas" (data no passado) e não entrava em "já passaram".
 */
export function edicoesAnteriores(agora = new Date()): Edicao[] {
  const hoje = hojeISO(agora);
  return todasEdicoes()
    .filter((e) => e.data < hoje && e.status !== "cancelada" && e.artista !== "")
    .reverse();
}

export function proximaEdicao(agora = new Date()): Edicao {
  return proximasEdicoes(agora, 1)[0];
}

function placeholder(iso: string): Edicao {
  return {
    id: iso,
    data: iso,
    artista: "",
    instagram: "",
    tema: "",
    genero: "",
    horario: "",
    local: site.casa.nome,
    status: "a_confirmar",
    destaque: "",
  };
}

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export function mesCurto(iso: string): string {
  return MESES[Number(iso.split("-")[1]) - 1];
}

/** "24 SET" / "quinta-feira, 24 de setembro" / "24/09" */
export function formatData(iso: string, estilo: "curta" | "longa" | "numerica" = "curta"): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  if (estilo === "numerica") return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  if (estilo === "longa")
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(dt);
  return `${String(d).padStart(2, "0")} ${mesCurto(iso)}`;
}
