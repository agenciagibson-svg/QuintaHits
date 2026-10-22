import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { lerSessao } from "@/lib/adminAuth";
import { COOKIE_CASA } from "@/lib/casaAuth";
import { acessoDoEmail } from "@/lib/acessos";
import type { CasaId } from "@/config/casas";
import { sessaoEncerrada } from "@/lib/protecao";

/** Segunda camada além do middleware: toda rota /api/casa confere a sessão da casa antes de usar a service_role. */
export async function exigirSessaoCasa(): Promise<NextResponse | null> {
  const valor = (await cookies()).get(COOKIE_CASA)?.value;
  // Assinatura + ao menos uma casa no app AGORA (variáveis da Vercel ou usuário do painel) + cookie não encerrado.
  const sessao = await lerSessao(valor, "casa");
  if (sessao && (await acessoDoEmail(sessao.email)).casas.length > 0 && !(await sessaoEncerrada(valor).catch(() => false))) return null;
  return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
}

/** E-mail de quem está no app da casa (vai para a auditoria como autor das ações). */
export async function atorDaCasa(): Promise<string> {
  return (await lerSessao((await cookies()).get(COOKIE_CASA)?.value, "casa"))?.email ?? "desconhecido";
}

/** Casas que quem está no app atende (a equipe: todas com reserva; o dono do Florindos: só a Quinta Hits). */
export async function casasDaSessao(): Promise<CasaId[]> {
  const sessao = await lerSessao((await cookies()).get(COOKIE_CASA)?.value, "casa");
  return sessao ? (await acessoDoEmail(sessao.email)).casas : [];
}
