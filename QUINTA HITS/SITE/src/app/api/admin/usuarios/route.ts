import { NextResponse } from "next/server";
import { acessoDaSessao, exigirSessao } from "@/lib/adminSessao";
import { casasValidas, listarUsuarios, normalizarEmail } from "@/lib/acessos";
import { criarOuTrocarSenha, problemaNaSenha, removerConta } from "@/lib/contasAuth";
import { registrarAuditoria } from "@/lib/auditoria";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { emailAutorizado } from "@/lib/adminAuth";
import { casasDoEmail } from "@/lib/casaAuth";
import { CASAS, CASA_IDS } from "@/config/casas";

export const dynamic = "force-dynamic";

const erro = (mensagem: string, status: number) => NextResponse.json({ erro: mensagem }, { status });
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const tabelaAusente = (e: { code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205");
const SEM_TABELA = "Rode no Supabase a migração de usuários (migracao-2026-10-22-usuarios.sql) e tente de novo.";
/** Responsável (ADMIN_EMAILS na Vercel): fixo, não se edita nem se remove pelo painel (ninguém se tranca fora). */
const ehResponsavel = (email: string) => emailAutorizado(email);
/** Acesso que o e-mail tem pelas variáveis da Vercel (CASA_EMAILS...), base para editar quem ainda não tem cadastro. */
const casasDaVercel = (email: string) => CASA_IDS.filter((c) => CASAS[c].reservas && casasDoEmail(email).includes(c));

/** Quem gerencia usuários: só os responsáveis (ADMIN_EMAILS na Vercel). */
async function exigirGerente(): Promise<{ email: string } | NextResponse> {
  const negado = await exigirSessao();
  if (negado) return negado;
  const a = await acessoDaSessao();
  if (!a?.gerenciaUsuarios) return erro("Só o responsável pelo sistema pode incluir, editar ou remover usuários.", 403);
  return { email: a.email };
}

/** GET /api/admin/usuarios — responsáveis (fixos) e os demais usuários; `podeGerenciar` diz se quem vê pode mudar. */
export async function GET() {
  const negado = await exigirSessao();
  if (negado) return negado;
  try {
    const a = await acessoDaSessao();
    return NextResponse.json({ ...(await listarUsuarios()), podeGerenciar: !!a?.gerenciaUsuarios, voce: a?.email ?? "" });
  } catch {
    return erro("Não foi possível carregar os usuários.", 500);
  }
}

/**
 * POST /api/admin/usuarios — `{ email, nome?, senha, painel, casas[] }`: inclui o usuário (cria o login no Supabase Auth
 * com a senha informada) ou, se já existir, atualiza o acesso e troca a senha. Vale também para quem foi removido.
 */
export async function POST(req: Request) {
  const g = await exigirGerente();
  if (g instanceof NextResponse) return g;
  const b = await req.json().catch(() => null);
  const email = typeof b?.email === "string" ? normalizarEmail(b.email) : "";
  if (!EMAIL_RE.test(email) || email.length > 320) return erro("Informe um e-mail válido.", 400);
  if (ehResponsavel(email)) return erro("Esse e-mail é o responsável pelo sistema (definido na Vercel).", 409);
  const nome = typeof b?.nome === "string" ? b.nome.trim().slice(0, 80) : "";
  const painel = b?.painel === true;
  const casas = casasValidas(b?.casas);
  if (!painel && casas.length === 0) return erro("Escolha o acesso: painel ou ao menos uma casa no app de reservas.", 400);
  const problema = problemaNaSenha(b?.senha);
  if (problema) return erro(problema, 400);

  try {
    const { error } = await supabaseAdmin()
      .from("usuarios_acesso")
      .upsert({ email, nome, painel, casas, ativo: true, criado_por: g.email, atualizado_em: new Date().toISOString() }, { onConflict: "email" });
    if (tabelaAusente(error)) return erro(SEM_TABELA, 503);
    if (error) throw error;
    const conta = await criarOuTrocarSenha(email, b.senha);
    await registrarAuditoria({ ator: g.email, acao: "usuario_incluido", entidade: "usuario", entidadeId: email, detalhe: { painel, casas, conta } });
    return NextResponse.json({ ok: true, conta }, { status: 201 });
  } catch (e) {
    console.error("Erro ao incluir usuário:", (e as { code?: string })?.code ?? (e as { status?: number })?.status ?? "erro");
    return erro("Não foi possível incluir o usuário. Confira o e-mail e tente de novo.", 500);
  }
}

/**
 * PUT /api/admin/usuarios — `{ email, painel?, casas?, nome?, senha? }`: muda o acesso e/ou troca a senha. Quem está só
 * nas variáveis da Vercel (CASA_EMAILS...) ganha o cadastro aqui na primeira edição, e daí em diante o painel manda.
 */
export async function PUT(req: Request) {
  const g = await exigirGerente();
  if (g instanceof NextResponse) return g;
  const b = await req.json().catch(() => null);
  const email = typeof b?.email === "string" ? normalizarEmail(b.email) : "";
  if (!EMAIL_RE.test(email)) return erro("Informe o e-mail.", 400);
  if (ehResponsavel(email)) return erro("O responsável pelo sistema é definido na Vercel e não muda por aqui.", 409);
  if (b?.senha !== undefined) {
    const problema = problemaNaSenha(b.senha);
    if (problema) return erro(problema, 400);
  }
  try {
    const db = supabaseAdmin();
    const { data: atual, error: e1 } = await db.from("usuarios_acesso").select("nome, painel, casas, ativo").eq("email", email).maybeSingle();
    if (tabelaAusente(e1)) return erro(SEM_TABELA, 503);
    if (e1) throw e1;
    const daVercel = casasDaVercel(email);
    const base = atual && (atual as { ativo: boolean }).ativo ? (atual as { nome: string; painel: boolean; casas: string[] }) : daVercel.length ? { nome: "", painel: false, casas: daVercel } : null;
    if (!base) return erro("Usuário não encontrado.", 404);
    const novo = {
      nome: typeof b?.nome === "string" ? b.nome.trim().slice(0, 80) : base.nome,
      painel: typeof b?.painel === "boolean" ? b.painel : base.painel,
      casas: b?.casas !== undefined ? casasValidas(b.casas) : casasValidas(base.casas),
    };
    // Sem acesso nenhum não faz sentido (para tirar o acesso, use Remover).
    if (!novo.painel && novo.casas.length === 0) return erro("Deixe ao menos um acesso (painel ou uma casa). Para tirar o acesso, use Remover.", 400);
    const { error } = await db
      .from("usuarios_acesso")
      .upsert({ email, ...novo, ativo: true, ...(atual ? {} : { criado_por: g.email }), atualizado_em: new Date().toISOString() }, { onConflict: "email" });
    if (error) throw error;
    if (b?.senha !== undefined) await criarOuTrocarSenha(email, b.senha);
    await registrarAuditoria({ ator: g.email, acao: "usuario_alterado", entidade: "usuario", entidadeId: email, detalhe: { painel: novo.painel, casas: novo.casas, senha_trocada: b?.senha !== undefined } });
    return NextResponse.json({ ok: true });
  } catch {
    return erro("Não foi possível salvar.", 500);
  }
}

/**
 * DELETE /api/admin/usuarios?email=… — tira o acesso na hora e apaga o login do Supabase Auth. Quem também está nas
 * variáveis da Vercel fica com o cadastro INATIVO (bloqueia mesmo com o e-mail ainda na variável).
 */
export async function DELETE(req: Request) {
  const g = await exigirGerente();
  if (g instanceof NextResponse) return g;
  const email = normalizarEmail(new URL(req.url).searchParams.get("email") ?? "");
  if (!EMAIL_RE.test(email)) return erro("Informe o e-mail.", 400);
  if (ehResponsavel(email)) return erro("O responsável pelo sistema é definido na Vercel e não pode ser removido por aqui.", 409);
  try {
    const db = supabaseAdmin();
    const naVercel = casasDaVercel(email).length > 0;
    const { data: atual, error: e1 } = await db.from("usuarios_acesso").select("ativo").eq("email", email).maybeSingle();
    if (tabelaAusente(e1)) return erro(SEM_TABELA, 503);
    if (e1) throw e1;
    if (!atual && !naVercel) return erro("Usuário não encontrado.", 404);
    if (naVercel) {
      const { error } = await db.from("usuarios_acesso").upsert({ email, painel: false, casas: [], ativo: false, atualizado_em: new Date().toISOString(), ...(atual ? {} : { criado_por: g.email }) }, { onConflict: "email" });
      if (error) throw error;
    } else {
      const { error } = await db.from("usuarios_acesso").delete().eq("email", email);
      if (error) throw error;
    }
    const contaApagada = await removerConta(email).catch(() => false);
    await registrarAuditoria({ ator: g.email, acao: "usuario_removido", entidade: "usuario", entidadeId: email, detalhe: { conta_apagada: contaApagada, bloqueado_na_vercel: naVercel } });
    return NextResponse.json({ ok: true });
  } catch {
    return erro("Não foi possível remover.", 500);
  }
}
