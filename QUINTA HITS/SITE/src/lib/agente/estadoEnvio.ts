import "server-only";
import { ambienteAtual, envioRealPermitidoPorEnv } from "./ambiente";
import { obterConfig } from "./repositorio";

/**
 * O envio REAL pela Meta está liberado neste momento? Só com as duas chaves de ambiente (agente e envio), as duas
 * configurações do banco, sem pausa de emergência e com o ambiente do banco igual ao do deploy. Enquanto for falso,
 * toda resposta do painel fica na fila em MODO SIMULADO: nada é enviado e a Meta não é chamada.
 */
export async function envioRealAtivoAgora(): Promise<boolean> {
  const config = await obterConfig().catch(() => null);
  return !!config && envioRealPermitidoPorEnv() && config.agente_ativo && config.envio_ativo && !config.pausa_emergencia && config.ambiente === ambienteAtual();
}
