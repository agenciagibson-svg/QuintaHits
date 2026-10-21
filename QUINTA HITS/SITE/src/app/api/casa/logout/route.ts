import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { encerrarSessao } from "@/lib/protecao";
import { COOKIE_CASA } from "@/lib/casaAuth";

/** Sair: apaga o cookie no navegador E encerra a sessão no servidor (uma cópia do cookie deixa de valer). */
export async function POST() {
  await encerrarSessao((await cookies()).get(COOKIE_CASA)?.value).catch(() => undefined);
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(COOKIE_CASA, "", { path: "/", maxAge: 0 });
  return resposta;
}
