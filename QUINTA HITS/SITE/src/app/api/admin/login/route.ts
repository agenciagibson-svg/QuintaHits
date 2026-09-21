import { NextResponse } from "next/server";
import { COOKIE_NAME, SESSAO_DURACAO_S, criarSessao } from "@/lib/adminAuth";
import { verificarLogin } from "@/lib/adminLogin";
import { registrarAuditoria } from "@/lib/auditoria";
import { excedeu, registrarTentativa } from "@/lib/limiteTaxa";

export async function POST(req: Request) {
  // Limite de tentativas FALHAS por endereço (5 a cada 15 min), além do atraso fixo de cada erro. Logins que dão certo não
  // contam (a equipe toda no mesmo Wi-Fi não se bloqueia). Vale por instância do servidor; na Vercel o cabeçalho vem do proxy deles.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sem-ip";
  const chaveLimite = `login:${ip}`;
  if (excedeu(chaveLimite, 5, 15 * 60_000)) {
    return NextResponse.json({ erro: "Muitas tentativas. Aguarde alguns minutos e tente de novo." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const email = body?.email;
  const senha = body?.senha;

  if (typeof email !== "string" || typeof senha !== "string" || !(await verificarLogin(email, senha))) {
    registrarTentativa(chaveLimite);
    // Atraso fixo em cada erro: torna tentativa de senha em massa lenta.
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json({ erro: "E-mail ou senha incorretos." }, { status: 401 });
  }

  const emailNormalizado = email.trim().toLowerCase();
  const valorCookie = await criarSessao(emailNormalizado);
  await registrarAuditoria({ ator: emailNormalizado, acao: "login_painel", entidade: "sessao" });
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
