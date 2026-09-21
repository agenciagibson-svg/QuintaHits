import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Registro de auditoria (tabela `auditoria`): quem fez o quê. NUNCA recebe segredos nem conteúdo de conversa;
 * o `detalhe` guarda só nomes de campos e contagens. Falha em gravar não derruba a operação principal.
 */
export async function registrarAuditoria(e: { ator: string; acao: string; entidade: string; entidadeId?: string; detalhe?: Record<string, unknown> }): Promise<void> {
  try {
    const { error } = await supabaseAdmin()
      .from("auditoria")
      .insert({ ator: e.ator, acao: e.acao, entidade: e.entidade, entidade_id: e.entidadeId ?? null, detalhe: e.detalhe ?? {} });
    if (error) console.error("Auditoria não gravada:", error.code);
  } catch {
    console.error("Auditoria não gravada.");
  }
}
