import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { site } from "@/config/site";
import { hojeISO, proximaQuintaISO, somaDias, type Edicao } from "@/lib/edicao";

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

/** Próximas edições. Se a próxima quinta não tiver registro, cria um placeholder "a confirmar". */
export async function proximasEdicoes(agora = new Date(), limite = 4): Promise<Edicao[]> {
  const hoje = hojeISO(agora);
  const todas = await todasEdicoes();
  const futuras = todas.filter((e) => e.data >= hoje && e.status !== "cancelada");
  const proxQuinta = proximaQuintaISO(agora);
  const lista = futuras.some((e) => e.data === proxQuinta)
    ? futuras
    : [placeholder(proxQuinta), ...futuras];
  // completa a lista com as quintas seguintes, sem registro, até o limite
  let cursor = proxQuinta;
  while (lista.length < limite) {
    cursor = somaDias(cursor, 7);
    if (!lista.some((e) => e.data === cursor)) lista.push(placeholder(cursor));
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data)).slice(0, limite);
}

export async function edicoesAnteriores(agora = new Date()): Promise<Edicao[]> {
  const hoje = hojeISO(agora);
  const todas = await todasEdicoes();
  return todas.filter((e) => e.data < hoje && e.status === "realizada").reverse();
}

export async function proximaEdicao(agora = new Date()): Promise<Edicao> {
  const [e] = await proximasEdicoes(agora, 1);
  return e;
}
