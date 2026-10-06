import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { lerSessao } from "@/lib/adminAuth";
import { COOKIE_CASA, sessaoCasaValida } from "@/lib/casaAuth";

/** Segunda camada além do middleware: toda rota /api/casa confere a sessão da casa antes de usar a service_role. */
export async function exigirSessaoCasa(): Promise<NextResponse | null> {
  const valor = (await cookies()).get(COOKIE_CASA)?.value;
  if (await sessaoCasaValida(valor)) return null;
  return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
}

/** E-mail de quem está no app da casa (vai para a auditoria como autor das ações). */
export async function atorDaCasa(): Promise<string> {
  return (await lerSessao((await cookies()).get(COOKIE_CASA)?.value, "casa"))?.email ?? "desconhecido";
}
