import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, sessaoValida } from "@/lib/adminAuth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
