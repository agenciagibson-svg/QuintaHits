import { lerSessao } from "@/lib/adminAuth";
import { CASAS, CASA_IDS, type CasaId } from "@/config/casas";

/**
 * Sessão do app da CASA (/casa — o PWA de reservas). Cookie PRÓPRIO, separado do painel: quem entra pela casa nunca
 * ganha acesso a /admin: a assinatura é feita com a finalidade "casa" (adminAuth.ts), então o cookie da casa não vale
 * como cookie do painel nem copiado, e o painel ainda exige ADMIN_EMAILS. Roda no middleware (Edge).
 */
export const COOKIE_CASA = "qh_casa_session";

const lista = (valor: string | undefined) => (valor ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/**
 * Quem atende cada casa no app (além da equipe). Leitura explícita de cada variável (o Edge não lê nome montado).
 *   CASA_EMAILS              → QUINTA HITS (Florindos: o dono e quem ele indicar)
 *   CASA_EMAILS_HARLEY_GRILL → Harley Grill (quando a casa tiver alguém próprio no app)
 *   CASA_EMAILS_SOLARIUM     → Solarium Beach Bar
 */
const EMAILS_DA_CASA: Record<CasaId, () => string | undefined> = {
  "quinta-hits": () => process.env.CASA_EMAILS,
  "harley-grill": () => process.env.CASA_EMAILS_HARLEY_GRILL,
  solarium: () => process.env.CASA_EMAILS_SOLARIUM,
};

/**
 * Casas que este e-mail atende no app. A equipe (ADMIN_EMAILS) vê todas as casas com reserva pelo site; o pessoal de
 * cada casa vê só a sua (o dono do Florindos não vê os pedidos do Harley). Conferido a cada requisição.
 */
export function casasDoEmail(email: string): CasaId[] {
  const e = email.trim().toLowerCase();
  const comReserva = CASA_IDS.filter((c) => CASAS[c].reservas);
  if (lista(process.env.ADMIN_EMAILS).includes(e)) return comReserva;
  return comReserva.filter((c) => lista(EMAILS_DA_CASA[c]()).includes(e));
}

/** Pode usar o app da casa? Precisa atender ao menos uma casa. Tirar o e-mail da lista derruba o acesso na hora. */
export function emailDaCasa(email: string): boolean {
  return casasDoEmail(email).length > 0;
}

export async function sessaoCasaValida(valorCookie: string | undefined): Promise<boolean> {
  const sessao = await lerSessao(valorCookie, "casa");
  return sessao !== null && emailDaCasa(sessao.email);
}
