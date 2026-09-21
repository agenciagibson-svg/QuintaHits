import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, lerSessao, sessaoValida } from "@/lib/adminAuth";
import { registrarAuditoria } from "@/lib/auditoria";

/**
 * Checagem de sessão dentro de cada rota de admin — segunda camada além do middleware,
 * para que uma mudança no matcher nunca deixe uma rota com a service_role aberta.
 * Retorna a resposta 401 quando não autenticado; null quando pode seguir.
 */
export async function exigirSessao(): Promise<NextResponse | null> {
  const valor = (await cookies()).get(COOKIE_NAME)?.value;
  if (await sessaoValida(valor)) return null;
  return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
}

/** E-mail de quem está logado no painel (vem do cookie assinado); "desconhecido" só se a sessão sumiu no meio da requisição. */
export async function atorDaSessao(): Promise<string> {
  return (await lerSessao((await cookies()).get(COOKIE_NAME)?.value))?.email ?? "desconhecido";
}

/** Registra na auditoria uma ação feita no painel, com o e-mail real de quem a executou. Nunca recebe segredos nem conteúdo de conversa. */
export async function auditarPainel(acao: string, entidade: string, entidadeId?: string, detalhe?: Record<string, unknown>): Promise<void> {
  await registrarAuditoria({ ator: await atorDaSessao(), acao, entidade, entidadeId, detalhe });
}
