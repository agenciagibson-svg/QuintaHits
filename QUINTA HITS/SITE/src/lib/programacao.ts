import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { site } from "@/config/site";
import { hojeISO, proximaQuintaISO, somaDias, temEdicaoNoDia, type Edicao } from "@/lib/edicao";

// Tipos e helpers puros moram em lib/edicao.ts (seguro para client) e seguem disponíveis por aqui.
export * from "@/lib/edicao";

function placeholder(iso: string, casaNome = site.casa.nome): Edicao {
  return {
    id: iso,
    data: iso,
    artista: "",
    instagram: "",
    tema: "",
    genero: "",
    horario: "",
    local: casaNome,
    status: "a_confirmar",
    destaque: "",
  };
}

/**
 * Busca todas as edições cadastradas no banco, ordenadas por data (uma vez por render).
 * Em caso de erro, lança: numa regeneração o Next mantém a versão anterior da página
 * em vez de publicar uma programação vazia.
 */
export const todasEdicoes = cache(async (): Promise<Edicao[]> => {
  const { data, error } = await supabaseAdmin()
    .from("edicoes")
    .select("id, data, artista, instagram, tema, genero, horario, local, status, destaque")
    .order("data", { ascending: true });

  if (error) throw new Error(`Erro ao buscar edições: ${error.message}`);
  return (data ?? []) as Edicao[];
});

/** Datas com registro "cancelada" — quintas em que não existe Quinta Hits. */
export async function datasCanceladas(): Promise<string[]> {
  return (await todasEdicoes()).filter((e) => e.status === "cancelada").map((e) => e.data);
}

/** Hoje tem Quinta Hits? Quinta-feira em Uberlândia e a data não está cancelada. */
export async function temEdicaoHoje(agora = new Date()): Promise<boolean> {
  return temEdicaoNoDia(agora, await datasCanceladas());
}

/**
 * Próximas edições. Se uma quinta não tiver nenhum registro, cria um placeholder "a confirmar".
 * Uma quinta com registro "cancelada" (ex.: não vai ter Quinta Hits naquela semana) é pulada:
 * não aparece na lista e também não vira placeholder — ela conta como "já tratada".
 */
export async function proximasEdicoes(agora = new Date(), limite = 4): Promise<Edicao[]> {
  const hoje = hojeISO(agora);
  const futuras = (await todasEdicoes()).filter((e) => e.data >= hoje);
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
export async function edicoesAnteriores(agora = new Date()): Promise<Edicao[]> {
  const hoje = hojeISO(agora);
  return (await todasEdicoes())
    .filter((e) => e.data < hoje && e.status !== "cancelada" && e.artista !== "")
    .reverse();
}

/** A próxima EDIÇÃO real — quintas canceladas são puladas. */
export async function proximaEdicao(agora = new Date()): Promise<Edicao> {
  const [e] = await proximasEdicoes(agora, 1);
  return e;
}
