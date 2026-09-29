import { hojeISO, type Edicao } from "@/lib/edicao";
import type { Tom } from "./estilos";

/** Próxima edição (de hoje em diante, não cancelada); se não houver, a mais recente. `edicoes` vem em ordem decrescente de data. */
export function proximaEdicao(edicoes: Edicao[]): Edicao | null {
  const hoje = hojeISO();
  const futuras = edicoes.filter((e) => e.data >= hoje && e.status !== "cancelada");
  return futuras[futuras.length - 1] ?? edicoes[0] ?? null;
}

/** Edições de hoje em diante, da mais próxima para a mais distante. */
export function edicoesFuturas(edicoes: Edicao[]): Edicao[] {
  const hoje = hojeISO();
  return edicoes.filter((e) => e.data >= hoje).sort((a, b) => a.data.localeCompare(b.data));
}

const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};

/** "08" */
export const dia = (iso: string) => iso.slice(8, 10);
/** "out" */
export const mes = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "short" }).format(utc(iso)).replace(".", "");
/** "quinta, 8 de outubro" */
export const dataLonga = (iso: string) => {
  const t = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(utc(iso));
  return t.charAt(0).toUpperCase() + t.slice(1);
};
/** "qui, 08/10/2026" */
export const dataCurta = (iso: string) => {
  const sem = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" }).format(utc(iso)).replace(".", "");
  return `${sem}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
};

export const ROTULO_STATUS_EDICAO: Record<Edicao["status"], string> = {
  a_confirmar: "A confirmar",
  confirmada: "Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

export const TOM_STATUS_EDICAO: Record<Edicao["status"], Tom> = {
  a_confirmar: "alerta",
  confirmada: "ok",
  realizada: "neutro",
  cancelada: "perigo",
};
