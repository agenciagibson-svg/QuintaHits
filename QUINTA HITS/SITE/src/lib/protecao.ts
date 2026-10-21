import "server-only";
import { createHash, createHmac } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Proteções da revisão de segurança (21/10/2026) que precisam valer em TODAS as instâncias do servidor (na Vercel cada
 * instância tem a própria memória): ficam no banco. Banco sem a migração (migracao-2026-10-21-seguranca.sql): tudo aqui
 * só deixa de proteger, nunca derruba o login nem a reserva.
 */

const tabelaAusente = (e: { code?: string } | null | undefined) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703");

/** Hash com segredo (o mesmo da sessão): guarda a impressão de e-mail/IP sem guardar o dado. */
function impressao(tipo: string, valor: string): string {
  const segredo = process.env.ADMIN_SESSION_SECRET ?? "sem-segredo";
  return createHmac("sha256", segredo).update(`${tipo}:${valor.trim().toLowerCase()}`).digest("base64url").slice(0, 32);
}

// ---------------------------------------------------------------- login: limite por e-mail

/**
 * Erros seguidos que bloqueiam o e-mail; depois disso cada erro dobra o bloqueio (15 min, 30, 60), no máximo 1 hora —
 * teto baixo de propósito: quem tenta senhas no e-mail de outra pessoa não consegue deixá-la fora do painel por dias.
 */
export const ERROS_ATE_BLOQUEAR = 5;
const BLOQUEIO_BASE_MS = 15 * 60_000;
const BLOQUEIO_MAX_MS = 60 * 60_000;

/** E-mail bloqueado agora por excesso de senha errada? Devolve até quando (ISO) ou null. */
export async function loginBloqueado(email: string, agora = new Date()): Promise<string | null> {
  const { data, error } = await supabaseAdmin().from("login_tentativas").select("bloqueado_ate").eq("chave", impressao("login", email)).maybeSingle();
  if (error || !data) return null;
  const ate = (data as { bloqueado_ate: string | null }).bloqueado_ate;
  return ate && new Date(ate).getTime() > agora.getTime() ? new Date(ate).toISOString() : null;
}

/** Conta uma senha errada para o e-mail (exista ele ou não: quem tenta não descobre quais e-mails existem). */
export async function registrarFalhaDeLogin(email: string, agora = new Date()): Promise<void> {
  const db = supabaseAdmin();
  const chave = impressao("login", email);
  const { data, error } = await db.from("login_tentativas").select("falhas").eq("chave", chave).maybeSingle();
  if (tabelaAusente(error)) return;
  const falhas = ((data as { falhas?: number } | null)?.falhas ?? 0) + 1;
  const excesso = falhas - ERROS_ATE_BLOQUEAR;
  const bloqueadoAte = excesso >= 0 ? new Date(agora.getTime() + Math.min(BLOQUEIO_BASE_MS * 2 ** excesso, BLOQUEIO_MAX_MS)).toISOString() : null;
  await db.from("login_tentativas").upsert({ chave, falhas, bloqueado_ate: bloqueadoAte, atualizado_em: agora.toISOString() }, { onConflict: "chave" });
}

/** Login certo zera a contagem do e-mail. */
export async function limparFalhasDeLogin(email: string): Promise<void> {
  await supabaseAdmin().from("login_tentativas").delete().eq("chave", impressao("login", email));
}

/** Todo login que falha demora o MESMO tempo (e-mail fora da lista ou senha errada): o tempo não revela quem tem acesso. */
export const TEMPO_DE_RESPOSTA_DO_ERRO_MS = 1500;
export async function esperarAteCompletar(inicio: number, totalMs = TEMPO_DE_RESPOSTA_DO_ERRO_MS): Promise<void> {
  const falta = totalMs - (Date.now() - inicio);
  if (falta > 0) await new Promise((r) => setTimeout(r, falta));
}

// ---------------------------------------------------------------- sessão: "Sair" vale no servidor

const hashDaSessao = (cookie: string) => createHash("sha256").update(cookie.split(".")[2] ?? cookie).digest("base64url");

/** Encerra o cookie no servidor: mesmo copiado, ele não vale mais (até a hora em que ia expirar sozinho). */
export async function encerrarSessao(cookie: string | undefined): Promise<void> {
  if (!cookie) return;
  const expira = Number(cookie.split(".")[0]);
  if (!Number.isFinite(expira)) return;
  const db = supabaseAdmin();
  await db.from("sessoes_encerradas").upsert({ assinatura_hash: hashDaSessao(cookie), expira_em: new Date(expira).toISOString() }, { onConflict: "assinatura_hash" });
  // Faxina: linhas de cookies que já expiraram não servem para nada.
  await db.from("sessoes_encerradas").delete().lt("expira_em", new Date().toISOString());
}

/** O cookie foi encerrado com "Sair"? (consultado em toda rota de API do painel e do app da casa) */
export async function sessaoEncerrada(cookie: string | undefined): Promise<boolean> {
  if (!cookie) return false;
  const { data, error } = await supabaseAdmin().from("sessoes_encerradas").select("assinatura_hash").eq("assinatura_hash", hashDaSessao(cookie)).maybeSingle();
  return !error && !!data;
}

// ---------------------------------------------------------------- reserva pelo site: limite por endereço

/** Pedidos do site ainda abertos (aguardando ou confirmados) que um mesmo endereço pode segurar numa noite. */
export const PEDIDOS_ABERTOS_POR_ENDERECO = 3;

export const impressaoDoIp = (ip: string) => impressao("ip", ip);

/** Esse endereço já segura pedidos demais nesta noite? (conta no banco: vale para todas as instâncias) */
export async function enderecoNoLimite(edicaoId: string, ip: string | null): Promise<boolean> {
  if (!ip) return false;
  const { count, error } = await supabaseAdmin()
    .from("reservas")
    .select("id", { count: "exact", head: true })
    .eq("edicao_id", edicaoId)
    .eq("origem_ip_hash", impressaoDoIp(ip))
    .in("status", ["aguardando", "confirmada"]);
  if (error) return false;
  return (count ?? 0) >= PEDIDOS_ABERTOS_POR_ENDERECO;
}
