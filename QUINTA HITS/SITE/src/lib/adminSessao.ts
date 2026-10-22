import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, lerSessao } from "@/lib/adminAuth";
import { acessoDoEmail } from "@/lib/acessos";
import { registrarAuditoria } from "@/lib/auditoria";
import { sessaoEncerrada } from "@/lib/protecao";

/**
 * Checagem de sessão dentro de cada rota de admin — segunda camada além do middleware,
 * para que uma mudança no matcher nunca deixe uma rota com a service_role aberta.
 * Retorna a resposta 401 quando não autenticado; null quando pode seguir.
 */
export async function exigirSessao(): Promise<NextResponse | null> {
  const valor = (await cookies()).get(COOKIE_NAME)?.value;
  // Assinatura válida + e-mail com acesso ao painel AGORA (variáveis da Vercel ou usuário do painel) + cookie não
  // encerrado com "Sair". Removido pelo painel = perde o acesso na próxima requisição.
  const sessao = await lerSessao(valor);
  if (sessao && (await acessoDoEmail(sessao.email)).painel && !(await sessaoEncerrada(valor).catch(() => false))) return null;
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

/** Acesso de quem está no painel (para saber, por exemplo, se pode gerenciar usuários). */
export async function acessoDaSessao() {
  const sessao = await lerSessao((await cookies()).get(COOKIE_NAME)?.value);
  return sessao ? { email: sessao.email, ...(await acessoDoEmail(sessao.email)) } : null;
}
