import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME, criarSessao, lerSessao, sessaoValida } from "@/lib/adminAuth";
import { middleware } from "@/middleware";
import { _reiniciarLimites, limiteExcedido } from "@/lib/limiteTaxa";

// Sem sessão: nenhum cookie chega às rotas (o `exigirSessao` real lê daqui).
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const SEGREDO = "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres";

beforeEach(() => {
  vi.stubEnv("ADMIN_SESSION_SECRET", SEGREDO);
});
afterEach(() => vi.useRealTimers());

describe("cookie de sessão do painel", () => {
  it("guarda o e-mail de quem entrou, dentro do que é assinado", async () => {
    const cookie = await criarSessao("  Equipe@Exemplo.com ");
    expect(await lerSessao(cookie)).toEqual({ email: "equipe@exemplo.com" });
    expect(await sessaoValida(cookie)).toBe(true);
  });

  it("trocar o e-mail ou a assinatura invalida a sessão", async () => {
    const [expira, , assinatura] = (await criarSessao("a@x.com")).split(".");
    const outroEmail = Buffer.from("admin@x.com").toString("base64url");
    expect(await lerSessao(`${expira}.${outroEmail}.${assinatura}`)).toBeNull();
    const original = (await criarSessao("a@x.com")).split(".");
    expect(await lerSessao(`${original[0]}.${original[1]}.${original[2].slice(0, -2)}AA`)).toBeNull();
  });

  it("formato antigo (sem e-mail), lixo e cookie vazio são recusados", async () => {
    for (const ruim of [undefined, "", "abc", "1.2", `${Date.now() + 1e9}.assinatura`, "a.b.c.d"]) {
      expect(await lerSessao(ruim), String(ruim)).toBeNull();
      expect(await sessaoValida(ruim)).toBe(false);
    }
  });

  it("expira depois de 7 dias", async () => {
    const cookie = await criarSessao("a@x.com");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 8 * 24 * 3600 * 1000);
    expect(await lerSessao(cookie)).toBeNull();
  });

  it("cookie assinado com OUTRO segredo não vale", async () => {
    const cookie = await criarSessao("a@x.com");
    vi.stubEnv("ADMIN_SESSION_SECRET", "outro-segredo-de-teste-com-mais-de-trinta-e-dois-chars");
    expect(await lerSessao(cookie)).toBeNull();
  });

  it("segredo ausente ou curto: não cria sessão", async () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "curto");
    await expect(criarSessao("a@x.com")).rejects.toThrow(/ADMIN_SESSION_SECRET/);
  });
});

describe("middleware do admin", () => {
  const req = (caminho: string, cookie?: string) => new NextRequest(`http://localhost${caminho}`, cookie ? { headers: { cookie: `${COOKIE_NAME}=${cookie}` } } : undefined);

  it("sem sessão: páginas redirecionam para o login e a API responde 401", async () => {
    const pagina = await middleware(req("/admin"));
    expect(pagina.status).toBe(307);
    expect(pagina.headers.get("location")).toContain("/admin/login");
    expect((await middleware(req("/api/admin/mesas"))).status).toBe(401);
    expect((await middleware(req("/api/admin/whatsapp/atendimento"))).status).toBe(401);
  });

  it("a página e a API de login ficam acessíveis; com sessão válida o painel abre", async () => {
    expect((await middleware(req("/admin/login"))).headers.get("x-middleware-next")).toBe("1");
    expect((await middleware(req("/api/admin/login"))).headers.get("x-middleware-next")).toBe("1");
    expect((await middleware(req("/admin", await criarSessao("a@x.com")))).headers.get("x-middleware-next")).toBe("1");
  });

  it("cookie forjado não abre o painel", async () => {
    expect((await middleware(req("/api/admin/mesas", "1999999999999.YQ.YQ"))).status).toBe(401);
  });
});

/** Todas as rotas /api/admin (exceto login e logout) precisam recusar quem não está logado, antes de tocar em qualquer dado. */
function rotasDoAdmin(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return rotasDoAdmin(caminho);
    return nome === "route.ts" ? [caminho] : [];
  });
}

describe("toda rota /api/admin recusa quem não está logado", () => {
  const raiz = fileURLToPath(new URL("../src/app/api/admin", import.meta.url));
  const arquivos = rotasDoAdmin(raiz).filter((f) => !/[\\/](login|logout)[\\/]route\.ts$/.test(f));

  it("encontra as rotas esperadas (proteção contra o teste passar vazio)", () => {
    expect(arquivos.length).toBeGreaterThanOrEqual(12);
  });

  for (const arquivo of arquivos) {
    const nome = arquivo.slice(raiz.length + 1).replace(/\\/g, "/");
    it(`${nome}: 401 em todos os métodos`, async () => {
      const modulo = (await import(/* @vite-ignore */ arquivo)) as Record<string, unknown>;
      const metodos = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((m) => typeof modulo[m] === "function");
      expect(metodos.length).toBeGreaterThan(0);
      for (const metodo of metodos) {
        const chamada = modulo[metodo] as (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response>;
        const r = await chamada(new Request("http://localhost/x", { method: metodo, headers: { "content-type": "application/json" }, body: metodo === "GET" || metodo === "DELETE" ? undefined : "{}" }), { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }) });
        expect(r.status, `${metodo} ${nome}`).toBe(401);
      }
    });
  }
});

describe("limite de tentativas", () => {
  beforeEach(() => _reiniciarLimites());

  it("passa a recusar depois do máximo dentro da janela e libera quando a janela acaba", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(limiteExcedido("k", 5, 60_000, t0 + i)).toBe(false);
    expect(limiteExcedido("k", 5, 60_000, t0 + 10)).toBe(true);
    expect(limiteExcedido("outra", 5, 60_000, t0 + 10)).toBe(false);
    expect(limiteExcedido("k", 5, 60_000, t0 + 61_000)).toBe(false);
  });

  it("o login responde 429 quando o mesmo endereço passa de 5 tentativas", async () => {
    const { POST } = await import("@/app/api/admin/login/route");
    for (let i = 0; i < 5; i++) limiteExcedido("login:9.9.9.9", 5, 15 * 60_000);
    const r = await POST(new Request("http://localhost/api/admin/login", { method: "POST", headers: { "x-forwarded-for": "9.9.9.9", "content-type": "application/json" }, body: JSON.stringify({ email: "a@x.com", senha: "x" }) }));
    expect(r.status).toBe(429);
    expect((await r.json()).erro).toMatch(/Muitas tentativas/);
  });
});
