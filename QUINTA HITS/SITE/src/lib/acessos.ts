import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { emailAutorizado } from "@/lib/adminAuth";
import { casasDoEmail } from "@/lib/casaAuth";
import { CASAS, CASA_IDS, ehCasa, type CasaId } from "@/config/casas";

/**
 * QUEM ENTRA ONDE. Duas fontes, somadas:
 *  1. variáveis da Vercel (ADMIN_EMAILS, CASA_EMAILS, CASA_EMAILS_HARLEY_GRILL...) — as contas FIXAS, do dono; não dá
 *     para remover pelo painel (ninguém se tranca fora);
 *  2. tabela `usuarios_acesso` — as contas criadas no painel (Configuração → Usuários).
 * Conferido a CADA requisição das APIs do painel e do app: remover alguém tira o acesso na hora.
 */

export type Acesso = {
  /** Entra no painel (/admin). */
  painel: boolean;
  /** Casas que vê no app de reservas (PWA). Quem tem painel vê todas as casas com reserva. */
  casas: CasaId[];
  /** Conta das variáveis da Vercel (fixa). */
  fixo: boolean;
  /** Pode incluir e remover usuários: só as contas fixas do painel (ADMIN_EMAILS). */
  gerenciaUsuarios: boolean;
};

export type UsuarioCadastrado = { email: string; nome: string; painel: boolean; casas: CasaId[]; ativo: boolean; criado_por: string | null; criado_em: string };

const CASAS_COM_RESERVA = () => CASA_IDS.filter((c) => CASAS[c].reservas);
const tabelaAusente = (e: { code?: string } | null | undefined) => !!e && (e.code === "42P01" || e.code === "PGRST205");

export const normalizarEmail = (e: string) => e.trim().toLowerCase();

/** Casas válidas (com reserva pelo site), sem repetição e na ordem do sistema. */
export const casasValidas = (lista: unknown): CasaId[] =>
  Array.isArray(lista) ? CASAS_COM_RESERVA().filter((c) => lista.some((x) => ehCasa(x) && x === c)) : [];

/** Linha da tabela (ativa) para o e-mail, ou null (tabela ainda não criada = null). */
async function cadastroDoEmail(email: string): Promise<UsuarioCadastrado | null> {
  const { data, error } = await supabaseAdmin().from("usuarios_acesso").select("email, nome, painel, casas, ativo, criado_por, criado_em").eq("email", normalizarEmail(email)).maybeSingle();
  if (error || !data) return null;
  const u = data as UsuarioCadastrado;
  return { ...u, casas: casasValidas(u.casas) };
}

export async function acessoDoEmail(email: string): Promise<Acesso> {
  const e = normalizarEmail(email);
  const fixoPainel = emailAutorizado(e);
  const fixoCasas = casasDoEmail(e);
  const u = await cadastroDoEmail(e).catch(() => null);
  const ativo = u?.ativo ? u : null;
  const painel = fixoPainel || !!ativo?.painel;
  const casas = painel ? CASAS_COM_RESERVA() : CASAS_COM_RESERVA().filter((c) => fixoCasas.includes(c) || !!ativo?.casas.includes(c));
  return { painel, casas, fixo: fixoPainel || fixoCasas.length > 0, gerenciaUsuarios: fixoPainel };
}

/** Lista para a tela de usuários: contas fixas (variáveis da Vercel) e as cadastradas no painel. */
export async function listarUsuarios(): Promise<{ fixos: { email: string; painel: boolean; casas: CasaId[] }[]; cadastrados: UsuarioCadastrado[]; tabela: boolean }> {
  const lista = (nome: string) => (process.env[nome] ?? "").split(",").map((x) => normalizarEmail(x)).filter(Boolean);
  const emails = [...new Set([...lista("ADMIN_EMAILS"), ...lista("CASA_EMAILS"), ...lista("CASA_EMAILS_HARLEY_GRILL"), ...lista("CASA_EMAILS_SOLARIUM")])];
  const fixos = emails.map((email) => {
    const painel = emailAutorizado(email);
    return { email, painel, casas: painel ? CASAS_COM_RESERVA() : casasDoEmail(email) };
  });
  const { data, error } = await supabaseAdmin().from("usuarios_acesso").select("email, nome, painel, casas, ativo, criado_por, criado_em").order("criado_em", { ascending: true });
  if (tabelaAusente(error)) return { fixos, cadastrados: [], tabela: false };
  if (error) throw error;
  return { fixos, cadastrados: ((data ?? []) as UsuarioCadastrado[]).map((u) => ({ ...u, casas: casasValidas(u.casas) })), tabela: true };
}
