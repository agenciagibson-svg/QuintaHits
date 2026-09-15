import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, sessaoValida } from "@/lib/adminAuth";

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
