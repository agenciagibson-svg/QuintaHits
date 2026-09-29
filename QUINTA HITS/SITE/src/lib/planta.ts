/**
 * Planta do salão: elementos fixos (palco, bar, entrada...) desenhados no mapa de mesas.
 * Sem acesso a banco: tipos, rótulos e validação, usados pelo painel, pela API e pelo site.
 */

export type TipoElemento = "palco" | "bar" | "entrada" | "banheiro" | "dj" | "pista" | "caixa" | "parede" | "texto";

export type ElementoSalao = {
  id: string;
  tipo: TipoElemento;
  rotulo: string;
  /** Centro e tamanho em % do mapa. */
  x: number;
  y: number;
  w: number;
  h: number;
};

export const TIPOS_ELEMENTO: Record<TipoElemento, { nome: string; w: number; h: number }> = {
  palco: { nome: "Palco", w: 40, h: 12 },
  pista: { nome: "Pista", w: 28, h: 20 },
  dj: { nome: "DJ", w: 12, h: 8 },
  bar: { nome: "Bar", w: 12, h: 30 },
  caixa: { nome: "Caixa", w: 10, h: 7 },
  entrada: { nome: "Entrada", w: 14, h: 5 },
  banheiro: { nome: "Banheiros", w: 12, h: 10 },
  parede: { nome: "Parede", w: 30, h: 2 },
  texto: { nome: "Texto", w: 16, h: 6 },
};

export const MAX_ELEMENTOS = 30;

const ehTipo = (v: unknown): v is TipoElemento => typeof v === "string" && v in TIPOS_ELEMENTO;
const numeroEntre = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v)) * 10) / 10 : null;

/** Valida a lista inteira vinda do painel. Posições e tamanhos são ajustados para caber no mapa. */
export function validarPlanta(v: unknown): { elementos: ElementoSalao[] } | { erro: string } {
  if (!Array.isArray(v)) return { erro: "Planta inválida." };
  if (v.length > MAX_ELEMENTOS) return { erro: `No máximo ${MAX_ELEMENTOS} elementos no salão.` };
  const ids = new Set<string>();
  const elementos: ElementoSalao[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") return { erro: "Elemento inválido." };
    const e = item as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id.trim() : "";
    if (!/^[\w-]{1,40}$/.test(id) || ids.has(id)) return { erro: "Elemento sem identificação válida." };
    ids.add(id);
    if (!ehTipo(e.tipo)) return { erro: "Tipo de elemento inválido." };
    const rotulo = typeof e.rotulo === "string" ? e.rotulo.trim().slice(0, 30) : "";
    const w = numeroEntre(e.w, 2, 100);
    const h = numeroEntre(e.h, 2, 100);
    const x = numeroEntre(e.x, 0, 100);
    const y = numeroEntre(e.y, 0, 100);
    if (w === null || h === null || x === null || y === null) return { erro: "Posição ou tamanho inválido." };
    elementos.push({ id, tipo: e.tipo, rotulo, x, y, w, h });
  }
  return { elementos };
}

/** Lê o que veio do banco sem nunca quebrar o mapa: formato inesperado = sem elementos. */
export function plantaDoBanco(v: unknown): ElementoSalao[] {
  const lista = v && typeof v === "object" && Array.isArray((v as { elementos?: unknown }).elementos) ? (v as { elementos: unknown[] }).elementos : [];
  const r = validarPlanta(lista);
  return "erro" in r ? [] : r.elementos;
}
