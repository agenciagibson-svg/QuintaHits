import "server-only";
import { createClient } from "@supabase/supabase-js";
import { acessoDoEmail } from "@/lib/acessos";

/**
 * E-mails que podem entrar no painel (ADMIN_EMAILS, separados por vírgula).
 * Ter conta no Supabase Auth não basta: sem esta lista, qualquer cadastro feito
 * no projeto daria acesso ao painel.
 */
function emailsAutorizados(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Confere e-mail e senha no Supabase Auth. Fica fora de adminAuth.ts porque aquele roda no middleware (Edge). */
export async function verificarLogin(email: string, senha: string): Promise<boolean> {
  // Variáveis da Vercel (ADMIN_EMAILS) ou usuário cadastrado no painel com acesso ao painel.
  if (!emailsAutorizados().includes(email.trim().toLowerCase()) && !(await acessoDoEmail(email)).painel) return false;
  return senhaConfere(email, senha);
}

/** Login do app da casa: e-mail em CASA_EMAILS ou ADMIN_EMAILS (ver casaAuth.ts) e senha certa no Supabase Auth. */
export async function verificarLoginCasa(email: string, senha: string): Promise<boolean> {
  if ((await acessoDoEmail(email)).casas.length === 0) return false;
  return senhaConfere(email, senha);
}

async function senhaConfere(email: string, senha: string): Promise<boolean> {
  const emailNormalizado = email.trim().toLowerCase();

  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return false;

  // Cliente novo a cada login: signInWithPassword guarda a sessão do usuário no cliente,
  // e o cliente compartilhado de supabaseAdmin() precisa continuar com a service role.
  const cliente = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await cliente.auth.signInWithPassword({ email: emailNormalizado, password: senha });
  return !error && data.user?.email?.toLowerCase() === emailNormalizado;
}
