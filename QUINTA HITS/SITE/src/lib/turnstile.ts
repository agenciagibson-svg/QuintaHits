import "server-only";

/**
 * Confere o token do Cloudflare Turnstile ("não sou robô").
 * Sem TURNSTILE_SECRET_KEY: em produção recusa (melhor sem reserva do que aberto a robô);
 * em desenvolvimento deixa passar, para o site rodar local sem conta na Cloudflare.
 */
export async function verificarTurnstile(token: unknown, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("TURNSTILE_SECRET_KEY não definida: reservas pelo site bloqueadas.");
      return false;
    }
    return true;
  }
  if (typeof token !== "string" || !token || token.length > 2048) return false;

  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const j = (await res.json()) as { success?: boolean };
    return j.success === true;
  } catch (e) {
    console.error("Falha ao verificar Turnstile:", e);
    return false;
  }
}
