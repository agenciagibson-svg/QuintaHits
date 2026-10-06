import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, sessaoValida } from "@/lib/adminAuth";
import { COOKIE_CASA, sessaoCasaValida } from "@/lib/casaAuth";

/** Do app da casa, só o que precisa abrir SEM login: a tela/API de login e os arquivos do app instalável. */
const PUBLICOS_CASA = new Set(["/casa/login", "/api/casa/login", "/api/casa/logout", "/casa/manifest.webmanifest"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ----- App da casa (/casa): sessão própria, separada do painel -----
  if (pathname === "/casa" || pathname.startsWith("/casa/") || pathname.startsWith("/api/casa")) {
    if (PUBLICOS_CASA.has(pathname) || pathname.startsWith("/casa/icones/")) return NextResponse.next();
    if (await sessaoCasaValida(req.cookies.get(COOKIE_CASA)?.value)) return NextResponse.next();
    if (pathname.startsWith("/api/casa")) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/casa/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // ----- Painel (/admin) -----
  // Login (página e API) fica sempre acessível — é onde a sessão é criada.
  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  const valido = await sessaoValida(cookie);

  if (!valido) {
    if (pathname.startsWith("/api/admin")) {
      return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/casa", "/casa/:path*", "/api/casa/:path*"],
};
