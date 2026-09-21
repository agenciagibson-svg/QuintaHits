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

/**
 * Gera o valor do cookie de sessão: "<expiraEm>.<e-mail em base64url>.<assinatura>".
 * O e-mail de quem entrou vai DENTRO do que é assinado: identifica quem executa cada ação do painel (auditoria)
 * e não pode ser trocado sem invalidar a assinatura.
 */
export async function criarSessao(email: string): Promise<string> {
  const expiraEm = String(Date.now() + SESSAO_DURACAO_S * 1000);
  const carga = `${expiraEm}.${paraBase64Url(encoder.encode(email.trim().toLowerCase()).buffer as ArrayBuffer)}`;
  const assinatura = await crypto.subtle.sign("HMAC", await chaveHmac("sign"), encoder.encode(carga));
  return `${carga}.${paraBase64Url(assinatura)}`;
}

/**
 * Lê o cookie de sessão: assinatura correta (verificação em tempo constante) e ainda não expirada.
 * Devolve o e-mail de quem entrou, ou null. Cookies no formato antigo (sem e-mail) são recusados: basta entrar de novo.
 */
export async function lerSessao(valorCookie: string | undefined): Promise<{ email: string } | null> {
  if (!valorCookie) return null;
  const partes = valorCookie.split(".");
  if (partes.length !== 3) return null;
  const [expiraEmStr, emailB64, assinaturaStr] = partes;
  if (!expiraEmStr || !emailB64 || !assinaturaStr) return null;
  const expiraEm = Number(expiraEmStr);
  if (!Number.isFinite(expiraEm) || Date.now() > expiraEm) return null;
  const assinatura = deBase64Url(assinaturaStr);
  const emailBytes = deBase64Url(emailB64);
  if (!assinatura || !emailBytes) return null;
  const confere = await crypto.subtle.verify("HMAC", await chaveHmac("verify"), assinatura, encoder.encode(`${expiraEmStr}.${emailB64}`));
  if (!confere) return null;
  const email = new TextDecoder().decode(emailBytes);
  return email ? { email } : null;
}

/** Sessão válida? (usado pelo middleware) */
export async function sessaoValida(valorCookie: string | undefined): Promise<boolean> {
  return (await lerSessao(valorCookie)) !== null;
}
