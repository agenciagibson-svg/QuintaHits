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

/** E-mail listado nas variáveis da Vercel do app da casa (CASA_EMAILS, CASA_EMAILS_HARLEY_GRILL...). */
export const estaNaVercel = (email: string) => casasDoEmail(normalizarEmail(email)).length > 0 || emailAutorizado(email);

/**
 * Acesso de um e-mail agora. Regras:
 *  - responsável (ADMIN_EMAILS na Vercel): painel e todas as casas, sempre — não se edita nem se remove pelo painel;
 *  - com linha na tabela: a linha manda (inclusive para quem também está em CASA_EMAILS na Vercel — é assim que o painel
 *    edita ou remove essas pessoas: removida = linha inativa, que bloqueia mesmo com o e-mail ainda na variável);
 *  - sem linha: o que estiver nas variáveis da Vercel.
 */
export async function acessoDoEmail(email: string): Promise<Acesso> {
  const e = normalizarEmail(email);
  const responsavel = emailAutorizado(e);
  const naVercel = casasDoEmail(e);
  if (responsavel) return { painel: true, casas: CASAS_COM_RESERVA(), fixo: true, gerenciaUsuarios: true };
  const u = await cadastroDoEmail(e).catch(() => null);
  if (u) {
    if (!u.ativo) return { painel: false, casas: [], fixo: naVercel.length > 0, gerenciaUsuarios: false };
    return { painel: u.painel, casas: u.painel ? CASAS_COM_RESERVA() : u.casas, fixo: naVercel.length > 0, gerenciaUsuarios: false };
  }
  return { painel: false, casas: CASAS_COM_RESERVA().filter((c) => naVercel.includes(c)), fixo: naVercel.length > 0, gerenciaUsuarios: false };
}

export type UsuarioDaLista = {
  email: string;
  nome: string;
  painel: boolean;
  casas: CasaId[];
  /** E-mail também listado nas variáveis da Vercel (CASA_EMAILS...). */
  vercel: boolean;
  criado_por: string | null;
  criado_em: string | null;
};

/**
 * Lista da tela de usuários: os responsáveis (ADMIN_EMAILS, fixos) e todos os outros — cadastrados no painel e os das
 * variáveis da Vercel ainda sem cadastro —, que podem ser editados e removidos. Removidos (linha inativa) não aparecem.
 */
export async function listarUsuarios(): Promise<{ responsaveis: string[]; usuarios: UsuarioDaLista[]; tabela: boolean }> {
  const lista = (nome: string) => (process.env[nome] ?? "").split(",").map((x) => normalizarEmail(x)).filter(Boolean);
  const responsaveis = [...new Set(lista("ADMIN_EMAILS"))];
  const daVercel = [...new Set([...lista("CASA_EMAILS"), ...lista("CASA_EMAILS_HARLEY_GRILL"), ...lista("CASA_EMAILS_SOLARIUM")])].filter((e) => !responsaveis.includes(e));
  const { data, error } = await supabaseAdmin().from("usuarios_acesso").select("email, nome, painel, casas, ativo, criado_por, criado_em").order("criado_em", { ascending: true });
  const ausente = tabelaAusente(error);
  if (error && !ausente) throw error;
  const linhas = ((data ?? []) as UsuarioCadastrado[]).filter((u) => !responsaveis.includes(u.email));
  const comLinha = new Set(linhas.map((u) => u.email));
  const usuarios: UsuarioDaLista[] = [
    ...daVercel
      .filter((e) => !comLinha.has(e))
      .map((email) => ({ email, nome: "", painel: false, casas: CASAS_COM_RESERVA().filter((c) => casasDoEmail(email).includes(c)), vercel: true, criado_por: null, criado_em: null })),
    ...linhas
      .filter((u) => u.ativo)
      .map((u) => ({ email: u.email, nome: u.nome, painel: u.painel, casas: u.painel ? CASAS_COM_RESERVA() : casasValidas(u.casas), vercel: daVercel.includes(u.email), criado_por: u.criado_por, criado_em: u.criado_em })),
  ];
  return { responsaveis, usuarios, tabela: !ausente };
}
