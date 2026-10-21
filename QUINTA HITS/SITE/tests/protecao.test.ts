import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { criarEdicao, criarMesa } from "./helpers/cenarios";

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});
const sessao = vi.hoisted(() => ({ casas: ["quinta-hits"] as string[] }));
vi.mock("@/lib/casaSessao", () => ({ exigirSessaoCasa: async () => null, atorDaCasa: async () => "porta@teste.com", casasDaSessao: async () => sessao.casas }));

import { encerrarSessao, enderecoNoLimite, impressaoDoIp, limparFalhasDeLogin, loginBloqueado, registrarFalhaDeLogin, sessaoEncerrada, ERROS_ATE_BLOQUEAR } from "@/lib/protecao";
import { criarSessao } from "@/lib/adminAuth";
import { jsonLdSeguro } from "@/lib/jsonLd";
import { verificarTurnstile } from "@/lib/turnstile";
import { consultarNaPorta } from "@/lib/checkin";
import { middleware } from "@/middleware";

let banco: BancoTeste;
beforeAll(async () => { banco = await criarBancoTeste(); });
afterAll(async () => { definirBanco(null); await banco.pg.close(); });
beforeEach(async () => {
  definirBanco(banco);
  await banco.limpar();
  vi.stubEnv("ADMIN_SESSION_SECRET", "segredo-de-teste-com-mais-de-32-caracteres!!");
});

describe("login: limite por e-mail, no banco", () => {
  it("5 senhas erradas bloqueiam o e-mail (qualquer instância, qualquer IP); acerto zera a conta", async () => {
    const agora = new Date("2099-01-01T12:00:00Z");
    for (let i = 0; i < ERROS_ATE_BLOQUEAR - 1; i++) await registrarFalhaDeLogin("Equipe@Gibson.com", agora);
    expect(await loginBloqueado("equipe@gibson.com", agora)).toBeNull();
    await registrarFalhaDeLogin("equipe@gibson.com", agora);
    const ate = await loginBloqueado("equipe@gibson.com", agora);
    expect(ate).toBe("2099-01-01T12:15:00.000Z"); // 15 min
    // Cada erro a mais dobra, mas nunca passa de 1 hora (ninguém deixa outra pessoa fora do painel por dias).
    for (let i = 0; i < 6; i++) await registrarFalhaDeLogin("equipe@gibson.com", agora);
    expect(await loginBloqueado("equipe@gibson.com", agora)).toBe("2099-01-01T13:00:00.000Z");
    expect(await loginBloqueado("equipe@gibson.com", new Date("2099-01-01T13:01:00Z"))).toBeNull();
    // O banco guarda só a impressão do e-mail, nunca o e-mail.
    expect(JSON.stringify(await banco.sql("select * from login_tentativas"))).not.toContain("gibson");
    await limparFalhasDeLogin("equipe@gibson.com");
    expect(await loginBloqueado("equipe@gibson.com", agora)).toBeNull();
  });
});

describe("sair encerra a sessão no servidor", () => {
  it("cookie encerrado deixa de valer; outro cookie do mesmo e-mail continua", async () => {
    const a = await criarSessao("equipe@gibson.com");
    const b = await criarSessao("equipe@gibson.com", "casa");
    expect(await sessaoEncerrada(a)).toBe(false);
    await encerrarSessao(a);
    expect(await sessaoEncerrada(a)).toBe(true);
    expect(await sessaoEncerrada(b)).toBe(false);
  });
});

describe("reserva pelo site: limite de pedidos abertos por endereço", () => {
  it("3 pedidos abertos do mesmo endereço na noite = limite; outro endereço segue livre", async () => {
    await criarEdicao(banco, { id: "2099-01-07" });
    for (const n of ["1", "2", "3"]) {
      const mesa = await criarMesa(banco, n);
      await banco.sql("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, status, origem_ip_hash) values ('2099-01-07', $1, 'X', $2, 2, 'aguardando', $3)", [mesa, `3499999000${n}`, impressaoDoIp("1.2.3.4")]);
    }
    expect(await enderecoNoLimite("2099-01-07", "1.2.3.4")).toBe(true);
    expect(await enderecoNoLimite("2099-01-07", "5.6.7.8")).toBe(false);
    await banco.sql("update reservas set status = 'cancelada' where mesa_id = (select id from mesas where numero = '1')");
    expect(await enderecoNoLimite("2099-01-07", "1.2.3.4")).toBe(false);
  });
});

describe("outras proteções", () => {
  it("dados estruturados: texto com </script> não fecha a tag", () => {
    const html = jsonLdSeguro({ name: "</script><script>alert(1)</script>" });
    expect(html).not.toContain("</script>");
    expect(JSON.parse(html)).toEqual({ name: "</script><script>alert(1)</script>" });
  });

  it("Turnstile: resolvido em outro site não vale", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "x");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, hostname: "golpe.com" }))));
    expect(await verificarTurnstile("tok", null, "www.quintahits.com.br")).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, hostname: "quintahits.com.br" }))));
    expect(await verificarTurnstile("tok", null, "www.quintahits.com.br")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("link do QR só consulta: abrir não registra entrada nem aprova pedido", async () => {
    vi.useFakeTimers({ now: new Date("2099-01-07T23:00:00Z"), toFake: ["Date"] });
    try {
      await criarEdicao(banco, { id: "2099-01-07" });
      const mesa = await criarMesa(banco, "9");
      const [{ id }] = await banco.sql<{ id: string }>("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, status, codigo) values ('2099-01-07', $1, 'Ana', '34999990000', 2, 'aguardando', 'QH-123123') returning id", [mesa]);
      const r = await consultarNaPorta(id, ["quinta-hits"]);
      expect(r).toMatchObject({ ok: true, reserva: { status: "aguardando", mesa: "9" } });
      const [linha] = await banco.sql<{ status: string; chegou_em: unknown }>("select status, chegou_em from reservas where id = $1", [id]);
      expect(linha).toEqual({ status: "aguardando", chegou_em: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it("painel e app da casa: pedido que muda dados vindo de outro site é recusado (CSRF)", async () => {
    const req = (metodo: string, origem?: string) =>
      new NextRequest("http://localhost/api/casa/checkin", { method: metodo, headers: { host: "localhost", ...(origem ? { origin: origem } : {}) } });
    expect((await middleware(req("POST", "https://golpe.com"))).status).toBe(403);
    expect((await middleware(new NextRequest("http://localhost/api/admin/mesas", { method: "DELETE", headers: { host: "localhost", origin: "https://golpe.com" } }))).status).toBe(403);
    expect((await middleware(req("POST", "http://localhost"))).status).toBe(401); // mesmo site: segue (e pede login)
    expect((await middleware(req("GET", "https://golpe.com"))).status).toBe(401); // leitura não muda nada
  });
});
