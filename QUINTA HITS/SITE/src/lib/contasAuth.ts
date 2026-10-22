import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Contas de login no Supabase Auth (e-mail + senha), criadas e removidas pelo painel (Configuração → Usuários).
 * A senha só passa por aqui a caminho do Supabase: não é guardada nem registrada em lugar nenhum do sistema.
 */

export const SENHA_MINIMA = 8;

/** Senha aceitável: 8+ caracteres, com letra e número. */
export function problemaNaSenha(senha: unknown): string | null {
  if (typeof senha !== "string" || senha.length < SENHA_MINIMA) return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
  if (senha.length > 72) return "A senha pode ter no máximo 72 caracteres.";
  if (!/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) return "Use letras e números na senha.";
  return null;
}

/** Id da conta pelo e-mail (procura nas páginas da lista de contas do projeto). */
async function idDaConta(email: string): Promise<string | null> {
  const auth = supabaseAdmin().auth.admin;
  for (let pagina = 1; pagina <= 50; pagina++) {
    const { data, error } = await auth.listUsers({ page: pagina, perPage: 200 });
    if (error) throw error;
    const achado = data.users.find((u) => u.email?.toLowerCase() === email);
    if (achado) return achado.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Cria a conta (e-mail já confirmado) ou, se já existir, troca a senha. */
export async function criarOuTrocarSenha(email: string, senha: string): Promise<"criada" | "senha_trocada"> {
  const auth = supabaseAdmin().auth.admin;
  const id = await idDaConta(email);
  if (id) {
    const { error } = await auth.updateUserById(id, { password: senha });
    if (error) throw error;
    return "senha_trocada";
  }
  const { error } = await auth.createUser({ email, password: senha, email_confirm: true });
  if (error) throw error;
  return "criada";
}

/** Apaga a conta de login (se existir). */
export async function removerConta(email: string): Promise<boolean> {
  const id = await idDaConta(email);
  if (!id) return false;
  const { error } = await supabaseAdmin().auth.admin.deleteUser(id);
  if (error) throw error;
  return true;
}
