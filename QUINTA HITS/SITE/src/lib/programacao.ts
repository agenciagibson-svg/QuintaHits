import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { CASA_PADRAO } from "@/config/casas";
import { hojeISO, temEdicaoNoDia, type Edicao } from "@/lib/edicao";

// Tipos e helpers puros moram em lib/edicao.ts (seguro para client) e seguem disponíveis por aqui.
export * from "@/lib/edicao";

/**
 * Busca todas as edições cadastradas no banco, ordenadas por data (uma vez por render).
 * Em caso de erro, lança: numa regeneração o Next mantém a versão anterior da página
 * em vez de publicar uma programação vazia.
 */
export const todasEdicoes = cache(async (): Promise<Edicao[]> => {
  const { data, error } = await supabaseAdmin()
    .from("edicoes")
    .select("id, data, artista, instagram, tema, genero, horario, local, status, destaque")
    // O site público (home, programação, faixa de hoje) é da QUINTA HITS; as outras casas têm agenda própria.
    .eq("casa", CASA_PADRAO)
    .order("data", { ascending: true });

  if (error) throw new Error(`Erro ao buscar edições: ${error.message}`);
  return (data ?? []) as Edicao[];
});

/** Datas (AAAA-MM-DD) com evento cadastrado e não cancelado — qualquer dia da semana. */
export async function datasComEvento(): Promise<string[]> {
  return (await todasEdicoes()).filter((e) => e.status !== "cancelada").map((e) => e.data);
}

/** Hoje tem evento da QUINTA HITS? Só se a data estiver na agenda (e não cancelada). */
export async function temEdicaoHoje(agora = new Date()): Promise<boolean> {
  return temEdicaoNoDia(agora, await datasComEvento());
}

/**
 * Próximos eventos: SÓ as datas cadastradas, de hoje em diante e sem as canceladas, em qualquer dia da semana.
 * (Antes o site inventava um card "a confirmar" para toda quinta sem registro; a marca agora faz eventos em outros
 * dias, então a agenda mostra apenas o que a equipe cadastrou.)
 */
export async function proximasEdicoes(agora = new Date(), limite = 4): Promise<Edicao[]> {
  const hoje = hojeISO(agora);
  return (await todasEdicoes()).filter((e) => e.data >= hoje && e.status !== "cancelada").slice(0, limite);
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

/** O próximo evento cadastrado (canceladas puladas); null se a agenda ainda não tem data futura. */
export async function proximaEdicao(agora = new Date()): Promise<Edicao | null> {
  const [e] = await proximasEdicoes(agora, 1);
  return e ?? null;
}
