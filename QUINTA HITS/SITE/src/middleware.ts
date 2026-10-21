import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, sessaoValida } from "@/lib/adminAuth";
import { COOKIE_CASA, sessaoCasaValida } from "@/lib/casaAuth";
import { CASAS, CASA_PADRAO, casaDoDominio } from "@/config/casas";

/** Do app da casa, só o que precisa abrir SEM login: a tela/API de login e os arquivos do app instalável. */
const PUBLICOS_CASA = new Set(["/casa/login", "/api/casa/login", "/api/casa/logout", "/casa/manifest.webmanifest"]);

/** Páginas públicas da Quinta Hits que, no domínio de OUTRA casa, levam à página de reserva dessa casa. */
const PAGINAS_DA_QUINTA = new Set(["/", "/reservar", "/programacao"]);

/** Métodos que mudam alguma coisa: só aceitos vindos do próprio site (proteção contra CSRF além do cookie SameSite). */
const MUDA = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Pedido de outro site? Com Origin (todo navegador manda em POST/PUT/DELETE): o host tem de ser o mesmo. */
function deOutroSite(req: NextRequest): boolean {
  const origem = req.headers.get("origin");
  if (!origem) return false;
  try {
    return new URL(origem).host !== (req.headers.get("host") || req.nextUrl.host);
  } catch {
    return true;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ----- Painel e app da casa: nada que mude dados aceito de outro site (CSRF) -----
  if ((pathname.startsWith("/api/admin") || pathname.startsWith("/api/casa")) && MUDA.has(req.method) && deOutroSite(req)) {
    return NextResponse.json({ erro: "Pedido recusado." }, { status: 403 });
  }

  // ----- Domínio próprio de outra casa (ex.: Harley Grill): a raiz abre a reserva dela -----
  const casaDoHost = casaDoDominio(req.headers.get("host") || req.nextUrl.host, process.env.DOMINIOS_CASAS);
  if (casaDoHost && casaDoHost !== CASA_PADRAO && PAGINAS_DA_QUINTA.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = CASAS[casaDoHost].pagina;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // ----- App da casa (/casa): sessão própria, separada do painel -----
  if (pathname === "/casa" || pathname.startsWith("/casa/") || pathname.startsWith("/api/casa")) {
    if (PUBLICOS_CASA.has(pathname) || pathname.startsWith("/casa/icones/")) return NextResponse.next();
    if (await sessaoCasaValida(req.cookies.get(COOKIE_CASA)?.value)) return NextResponse.next();
    if (pathname.startsWith("/api/casa")) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/casa/login";
    // QR lido com a câmera do celular fora do app: depois do login, volta para o check-in daquela reserva.
    url.search = /^\/casa\/checkin\/[0-9a-f-]{36}$/i.test(pathname) ? `?volta=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }

  // Daqui para baixo, só o painel exige login; as páginas públicas passam direto.
  if (!(pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin"))) {
    return NextResponse.next();
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
  matcher: ["/", "/reservar", "/programacao", "/admin/:path*", "/api/admin/:path*", "/casa", "/casa/:path*", "/api/casa/:path*"],
};
