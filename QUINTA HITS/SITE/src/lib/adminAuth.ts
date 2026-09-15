export const COOKIE_NAME = "qh_admin_session";
export const SESSAO_DURACAO_S = 7 * 24 * 60 * 60; // 7 dias

const encoder = new TextEncoder();

/**
 * Segredo próprio para assinar a sessão — nunca a senha, para que um cookie vazado
 * não sirva de base para descobrir a senha offline.
 */
function segredo(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("ADMIN_SESSION_SECRET precisa estar definida (mínimo 32 caracteres).");
  return s;
}

function chaveHmac(uso: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(segredo()), { name: "HMAC", hash: "SHA-256" }, false, [uso]);
}

/** ArrayBuffer -> base64url, sem depender de Buffer (compatível com o runtime Edge do middleware). */
function paraBase64Url(bytes: ArrayBuffer): string {
  let binario = "";
  for (const b of new Uint8Array(bytes)) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto: string): Uint8Array<ArrayBuffer> | null {
  try {
    const b64 = texto.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((texto.length + 3) % 4);
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Gera o valor do cookie de sessão: "<expiraEm>.<assinatura>". */
export async function criarSessao(): Promise<string> {
  const expiraEm = String(Date.now() + SESSAO_DURACAO_S * 1000);
  const assinatura = await crypto.subtle.sign("HMAC", await chaveHmac("sign"), encoder.encode(expiraEm));
  return `${expiraEm}.${paraBase64Url(assinatura)}`;
}

/** Valida o cookie de sessão: assinatura correta (verificação em tempo constante) e ainda não expirada. */
export async function sessaoValida(valorCookie: string | undefined): Promise<boolean> {
  if (!valorCookie) return false;
  const [expiraEmStr, assinaturaStr] = valorCookie.split(".");
  if (!expiraEmStr || !assinaturaStr) return false;
  const expiraEm = Number(expiraEmStr);
  if (!Number.isFinite(expiraEm) || Date.now() > expiraEm) return false;
  const assinatura = deBase64Url(assinaturaStr);
  if (!assinatura) return false;
  return crypto.subtle.verify("HMAC", await chaveHmac("verify"), assinatura, encoder.encode(expiraEmStr));
}

/** Compara em tempo constante: os dois lados viram SHA-256 (mesmo tamanho) antes da comparação byte a byte. */
export async function verificarSenha(senhaEnviada: string): Promise<boolean> {
  const senhaCorreta = process.env.ADMIN_PASSWORD;
  if (!senhaCorreta) return false;
  const [a, b] = await Promise.all(
    [senhaEnviada, senhaCorreta].map(async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(s)))),
  );
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a[i] ^ b[i];
  return diferenca === 0;
}
