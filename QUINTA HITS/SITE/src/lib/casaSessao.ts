import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { lerSessao } from "@/lib/adminAuth";
import { COOKIE_CASA, casasDoEmail, sessaoCasaValida } from "@/lib/casaAuth";
import type { CasaId } from "@/config/casas";
import { sessaoEncerrada } from "@/lib/protecao";

/** Segunda camada além do middleware: toda rota /api/casa confere a sessão da casa antes de usar a service_role. */
export async function exigirSessaoCasa(): Promise<NextResponse | null> {
  const valor = (await cookies()).get(COOKIE_CASA)?.value;
  if ((await sessaoCasaValida(valor)) && !(await sessaoEncerrada(valor).catch(() => false))) return null;
  return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
}

/** E-mail de quem está no app da casa (vai para a auditoria como autor das ações). */
export async function atorDaCasa(): Promise<string> {
  return (await lerSessao((await cookies()).get(COOKIE_CASA)?.value, "casa"))?.email ?? "desconhecido";
}

/** Casas que quem está no app atende (a equipe: todas com reserva; o dono do Florindos: só a Quinta Hits). */
export async function casasDaSessao(): Promise<CasaId[]> {
  const sessao = await lerSessao((await cookies()).get(COOKIE_CASA)?.value, "casa");
  return sessao ? casasDoEmail(sessao.email) : [];
}
