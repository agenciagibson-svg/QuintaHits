export const COOKIE_NAME = "qh_admin_session";
const SESSAO_DURACAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function segredo(): string {
  const s = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("ADMIN_PASSWORD (ou ADMIN_SESSION_SECRET) não está definida.");
  return s;
}

async function hmac(mensagem: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(mensagem));
  return paraBase64Url(assinatura);
}

/** ArrayBuffer -> base64url, sem depender de Buffer (compatível com o runtime Edge do middleware). */
function paraBase64Url(bytes: ArrayBuffer): string {
  let binario = "";
  for (const b of new Uint8Array(bytes)) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Gera o valor do cookie de sessão: "<expiraEm>.<assinatura>". */
export async function criarSessao(): Promise<string> {
  const expiraEm = Date.now() + SESSAO_DURACAO_MS;
  const assinatura = await hmac(String(expiraEm));
  return `${expiraEm}.${assinatura}`;
}

/** Valida o cookie de sessão: assinatura correta e ainda não expirada. */
export async function sessaoValida(valorCookie: string | undefined): Promise<boolean> {
  if (!valorCookie) return false;
  const [expiraEmStr, assinatura] = valorCookie.split(".");
  if (!expiraEmStr || !assinatura) return false;
  const expiraEm = Number(expiraEmStr);
  if (!Number.isFinite(expiraEm) || Date.now() > expiraEm) return false;
  const esperada = await hmac(expiraEmStr);
  return esperada === assinatura;
}

export function verificarSenha(senhaEnviada: string): boolean {
  const senhaCorreta = process.env.ADMIN_PASSWORD;
  if (!senhaCorreta) return false;
  return senhaEnviada === senhaCorreta;
}
