import { NextResponse } from "next/server";
import { COOKIE_NAME, criarSessao, verificarSenha } from "@/lib/adminAuth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const senha = body?.senha;

  if (typeof senha !== "string" || !verificarSenha(senha)) {
    return NextResponse.json({ erro: "Senha incorreta." }, { status: 401 });
  }

  const valorCookie = await criarSessao();
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(COOKIE_NAME, valorCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return resposta;
}
