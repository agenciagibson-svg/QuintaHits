import { lerSessao } from "@/lib/adminAuth";

/**
 * Sessão do app da CASA (/casa — o dono do bar). Cookie PRÓPRIO, separado do painel: quem entra pela casa nunca
 * ganha acesso a /admin: a assinatura é feita com a finalidade "casa" (adminAuth.ts), então o cookie da casa não vale
 * como cookie do painel nem copiado, e o painel ainda exige ADMIN_EMAILS. Roda no middleware (Edge).
 */
export const COOKIE_CASA = "qh_casa_session";

const lista = (nome: "CASA_EMAILS" | "ADMIN_EMAILS") =>
  (process.env[nome] ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/**
 * Pode usar o app da casa? CASA_EMAILS (o dono e quem ele indicar) ou ADMIN_EMAILS (a equipe também entra).
 * Conferido a cada requisição: tirar o e-mail da lista derruba o acesso na hora.
 */
export function emailDaCasa(email: string): boolean {
  const e = email.trim().toLowerCase();
  return lista("CASA_EMAILS").includes(e) || lista("ADMIN_EMAILS").includes(e);
}

export async function sessaoCasaValida(valorCookie: string | undefined): Promise<boolean> {
  const sessao = await lerSessao(valorCookie, "casa");
  return sessao !== null && emailDaCasa(sessao.email);
}
