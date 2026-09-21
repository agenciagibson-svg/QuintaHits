import { after } from "next/server";

/**
 * Roda uma tarefa DEPOIS de responder à Meta (o webhook precisa devolver 200 rápido). Usa `after()` do Next; fora de
 * uma requisição (scripts, testes) cai para execução imediata sem derrubar quem chamou.
 */
export function agendarDepois(tarefa: () => Promise<unknown>): void {
  const seguro = async () => {
    try {
      await tarefa();
    } catch (e) {
      console.error("Tarefa pós-resposta falhou:", e instanceof Error ? e.message : "erro");
    }
  };
  try {
    after(seguro);
  } catch {
    void seguro();
  }
}
