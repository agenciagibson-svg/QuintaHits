import { NextResponse } from "next/server";
import { acessoDaSessao, exigirSessao } from "@/lib/adminSessao";
import { casasValidas, listarUsuarios, normalizarEmail } from "@/lib/acessos";
import { criarOuTrocarSenha, problemaNaSenha, removerConta } from "@/lib/contasAuth";
import { registrarAuditoria } from "@/lib/auditoria";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { emailAutorizado } from "@/lib/adminAuth";
import { casasDoEmail } from "@/lib/casaAuth";

export const dynamic = "force-dynamic";

const erro = (mensagem: string, status: number) => NextResponse.json({ erro: mensagem }, { status });
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ehFixo = (email: string) => emailAutorizado(email) || casasDoEmail(email).length > 0;

/** Quem gerencia usuários: só as contas fixas do painel (ADMIN_EMAILS na Vercel) — o dono. */
async function exigirGerente(): Promise<{ email: string } | NextResponse> {
  const negado = await exigirSessao();
  if (negado) return negado;
  const a = await acessoDaSessao();
  if (!a?.gerenciaUsuarios) return erro("Só o responsável pelo sistema pode incluir ou remover usuários.", 403);
  return { email: a.email };
}

/** GET /api/admin/usuarios — contas fixas (Vercel) e cadastradas no painel; `podeGerenciar` diz se quem vê pode mudar. */
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
 * com a senha informada) ou, se já existir, atualiza o acesso e troca a senha.
 */
export async function POST(req: Request) {
  const g = await exigirGerente();
  if (g instanceof NextResponse) return g;
  const b = await req.json().catch(() => null);
  const email = typeof b?.email === "string" ? normalizarEmail(b.email) : "";
  if (!EMAIL_RE.test(email) || email.length > 320) return erro("Informe um e-mail válido.", 400);
  if (ehFixo(email)) return erro("Esse e-mail já é uma conta fixa (definida na Vercel).", 409);
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
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return erro("Rode no Supabase a migração de usuários (migracao-2026-10-22-usuarios.sql) e tente de novo.", 503);
      throw error;
    }
    const conta = await criarOuTrocarSenha(email, b.senha);
    await registrarAuditoria({ ator: g.email, acao: "usuario_incluido", entidade: "usuario", entidadeId: email, detalhe: { painel, casas, conta } });
    return NextResponse.json({ ok: true, conta }, { status: 201 });
  } catch (e) {
    console.error("Erro ao incluir usuário:", (e as { code?: string; status?: number })?.code ?? (e as { status?: number })?.status ?? "erro");
    return erro("Não foi possível incluir o usuário. Confira o e-mail e tente de novo.", 500);
  }
}

/** PUT /api/admin/usuarios — `{ email, painel?, casas?, nome?, senha? }`: muda o acesso e/ou troca a senha. */
export async function PUT(req: Request) {
  const g = await exigirGerente();
  if (g instanceof NextResponse) return g;
  const b = await req.json().catch(() => null);
  const email = typeof b?.email === "string" ? normalizarEmail(b.email) : "";
  if (!EMAIL_RE.test(email)) return erro("Informe o e-mail.", 400);
  if (ehFixo(email)) return erro("Conta fixa: o acesso dela é definido na Vercel.", 409);
  const campos: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  if (typeof b?.nome === "string") campos.nome = b.nome.trim().slice(0, 80);
  if (typeof b?.painel === "boolean") campos.painel = b.painel;
  if (b?.casas !== undefined) campos.casas = casasValidas(b.casas);
  if (b?.senha !== undefined) {
    const problema = problemaNaSenha(b.senha);
    if (problema) return erro(problema, 400);
  }
  try {
    const db = supabaseAdmin();
    const { data: atual, error: e1 } = await db.from("usuarios_acesso").select("painel, casas").eq("email", email).maybeSingle();
    if (e1) throw e1;
    if (!atual) return erro("Usuário não encontrado.", 404);
    const u = { painel: (campos.painel as boolean | undefined) ?? (atual as { painel: boolean }).painel, casas: (campos.casas as string[] | undefined) ?? casasValidas((atual as { casas: string[] }).casas) };
    // Sem acesso nenhum não faz sentido (para tirar o acesso, use Remover).
    if (!u.painel && u.casas.length === 0) return erro("Deixe ao menos um acesso (painel ou uma casa). Para tirar o acesso, use Remover.", 400);
    const { error } = await db.from("usuarios_acesso").update(campos).eq("email", email);
    if (error) throw error;
    if (b?.senha !== undefined) await criarOuTrocarSenha(email, b.senha);
    await registrarAuditoria({ ator: g.email, acao: "usuario_alterado", entidade: "usuario", entidadeId: email, detalhe: { painel: u.painel, casas: u.casas, senha_trocada: b?.senha !== undefined } });
    return NextResponse.json({ ok: true });
  } catch {
    return erro("Não foi possível salvar.", 500);
  }
}

/** DELETE /api/admin/usuarios?email=… — tira o acesso na hora e apaga o login do Supabase Auth. */
export async function DELETE(req: Request) {
  const g = await exigirGerente();
  if (g instanceof NextResponse) return g;
  const email = normalizarEmail(new URL(req.url).searchParams.get("email") ?? "");
  if (!EMAIL_RE.test(email)) return erro("Informe o e-mail.", 400);
  if (ehFixo(email)) return erro("Conta fixa: para remover, tire o e-mail das variáveis da Vercel.", 409);
  try {
    const { data, error } = await supabaseAdmin().from("usuarios_acesso").delete().eq("email", email).select("email").maybeSingle();
    if (error) throw error;
    if (!data) return erro("Usuário não encontrado.", 404);
    const contaApagada = await removerConta(email).catch(() => false);
    await registrarAuditoria({ ator: g.email, acao: "usuario_removido", entidade: "usuario", entidadeId: email, detalhe: { conta_apagada: contaApagada } });
    return NextResponse.json({ ok: true });
  } catch {
    return erro("Não foi possível remover.", 500);
  }
}
