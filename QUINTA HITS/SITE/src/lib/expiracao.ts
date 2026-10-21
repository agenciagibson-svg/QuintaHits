import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { marcarNaoComparecimentos } from "@/lib/checkin";

/**
 * Pedidos "aguardando" com prazo vencido viram "expirada" e soltam a mesa.
 * Roda antes de toda leitura/gravação de reservas (não há tarefa agendada): o índice único
 * do banco só enxerga o status, então a mesa só fica livre depois dessa troca.
 */
/**
 * Para leituras PÚBLICAS (página da reserva, consulta de status): expira no máximo a cada 30 s por instância, para que
 * abrir links em massa não vire uma escrita no banco a cada acesso. Gravação e painel seguem usando a versão direta.
 */
let ultimaExpiracao = 0;
export async function expirarPedidosDeVezEmQuando(agora = Date.now()): Promise<void> {
  if (agora - ultimaExpiracao < 30_000) return;
  ultimaExpiracao = agora;
  await expirarPedidosVencidos();
}

export async function expirarPedidosVencidos(): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("reservas")
    .update({ status: "expirada", updated_at: new Date().toISOString() })
    .eq("status", "aguardando")
    .lt("expira_em", new Date().toISOString());
  if (error) throw new Error(`Erro ao expirar pedidos: ${error.message}`);
  // Noite com check-in na porta: quem não chegou até o fim da tolerância solta a mesa (nunca lança erro).
  await marcarNaoComparecimentos();
}
