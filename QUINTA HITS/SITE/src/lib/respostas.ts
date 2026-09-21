/**
 * Erro interno sem vazamento: registra só o CÓDIGO do erro no log do servidor e devolve ao navegador uma mensagem
 * genérica (a mensagem original do banco pode citar tabelas, colunas ou valores).
 */
export function erroInterno(e: { code?: string } | null | undefined): string {
  console.error("Erro interno:", e?.code ?? "sem código");
  return "Não foi possível concluir a operação.";
}
