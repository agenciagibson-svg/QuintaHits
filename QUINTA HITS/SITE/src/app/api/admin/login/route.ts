import { NextResponse } from "next/server";
import { COOKIE_NAME, SESSAO_DURACAO_S, criarSessao } from "@/lib/adminAuth";
import { verificarLogin } from "@/lib/adminLogin";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = body?.email;
  const senha = body?.senha;

  if (typeof email !== "string" || typeof senha !== "string" || !(await verificarLogin(email, senha))) {
    // Atraso fixo em cada erro: torna tentativa de senha em massa lenta.
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json({ erro: "E-mail ou senha incorretos." }, { status: 401 });
  }

  const valorCookie = await criarSessao();
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(COOKIE_NAME, valorCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSAO_DURACAO_S,
  });
  return resposta;
}
