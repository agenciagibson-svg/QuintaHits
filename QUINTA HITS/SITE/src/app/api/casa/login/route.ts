import { NextResponse } from "next/server";
import { SESSAO_DURACAO_S, criarSessao } from "@/lib/adminAuth";
import { COOKIE_CASA } from "@/lib/casaAuth";
import { verificarLoginCasa } from "@/lib/adminLogin";
import { registrarAuditoria } from "@/lib/auditoria";
import { excedeu, registrarTentativa } from "@/lib/limiteTaxa";

/** POST /api/casa/login — entra no app da casa (dono do bar). Mesmas proteções do login do painel. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sem-ip";
  // Mesma conta de tentativas do login do painel: a equipe entra pelos dois, então os dois somam.
  const chaveLimite = `login:${ip}`;
  if (excedeu(chaveLimite, 5, 15 * 60_000)) {
    return NextResponse.json({ erro: "Muitas tentativas. Aguarde alguns minutos e tente de novo." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const email = body?.email;
  const senha = body?.senha;

  if (typeof email !== "string" || typeof senha !== "string" || !(await verificarLoginCasa(email, senha))) {
    registrarTentativa(chaveLimite);
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json({ erro: "E-mail ou senha incorretos." }, { status: 401 });
  }

  const emailNormalizado = email.trim().toLowerCase();
  const valorCookie = await criarSessao(emailNormalizado, "casa");
  await registrarAuditoria({ ator: emailNormalizado, acao: "login_casa", entidade: "sessao" });
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(COOKIE_CASA, valorCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSAO_DURACAO_S,
  });
  return resposta;
}
