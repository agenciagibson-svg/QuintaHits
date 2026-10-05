import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { aberturaSemanalDe, type AberturaSemanal } from "@/lib/regrasEdicao";

export type EstadoAberturaSemanal = { migrado: boolean; regra: AberturaSemanal | null };

/** As colunas da abertura semanal (migração de 05/10/2026) ainda não existem neste banco? */
export const colunasAberturaAusentes = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || e.code === "PGRST204");

/**
 * Padrão da casa para a abertura semanal das reservas pelo site (linha única site_config).
 * Sem a migração: `migrado: false` e nenhuma regra (o site segue como antes: abre assim que a edição está completa).
 * Outros erros de leitura sobem (quem chama já trata erro de banco), para nunca abrir reservas por engano.
 */
export async function carregarAberturaSemanal(): Promise<EstadoAberturaSemanal> {
  const { data, error } = await supabaseAdmin().from("site_config").select("reservas_abrem_dia, reservas_abrem_hora").eq("id", 1).maybeSingle();
  if (colunasAberturaAusentes(error)) return { migrado: false, regra: null };
  if (error) throw new Error(`Erro ao buscar a abertura semanal: ${error.message}`);
  const linha = data as { reservas_abrem_dia?: unknown; reservas_abrem_hora?: unknown } | null;
  return { migrado: true, regra: aberturaSemanalDe(linha?.reservas_abrem_dia ?? null, linha?.reservas_abrem_hora ?? null) };
}
