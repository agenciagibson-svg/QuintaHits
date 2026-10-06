import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";
import { criarEdicao, criarMesa } from "./helpers/cenarios";

/** Cookie que as rotas enxergam (next/headers): cada teste escolhe quem está "logado". */
const sessao = vi.hoisted(() => ({ cookies: {} as Record<string, string> }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (sessao.cookies[n] ? { value: sessao.cookies[n] } : undefined) }) }));
vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});
const push = vi.hoisted(() => ({ envios: [] as { endpoint: string }[], falharCom: null as number | null }));
vi.mock("web-push", () => ({
  default: {
    sendNotification: vi.fn(async (insc: { endpoint: string }) => {
      if (push.falharCom) throw Object.assign(new Error("push"), { statusCode: push.falharCom });
      push.envios.push(insc);
    }),
  },
}));

import { COOKIE_NAME, criarSessao } from "@/lib/adminAuth";
import { COOKIE_CASA, emailDaCasa, sessaoCasaValida } from "@/lib/casaAuth";
import { verificarLoginCasa } from "@/lib/adminLogin";
import { middleware } from "@/middleware";
import { GET as listar } from "@/app/api/casa/reservas/route";
import { PUT as mudar } from "@/app/api/casa/reservas/[id]/route";
import { DELETE as pushSair, GET as pushConfig, POST as pushEntrar } from "@/app/api/casa/push/route";
import { GET as manifest } from "@/app/casa/manifest.webmanifest/route";
import { GET as manifestDoSite } from "@/app/manifest.webmanifest/route";
import { notificarCasa, validarInscricao } from "@/lib/pushCasa";
import { linkWhatsappCliente } from "@/lib/mensagemCliente";

const SEGREDO = "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres";
const DONO = "dono@florindos.com";
const FCM = "https://fcm.googleapis.com/fcm/send/abc123";
const CHAVES = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };

beforeEach(() => {
  vi.stubEnv("ADMIN_SESSION_SECRET", SEGREDO);
  vi.stubEnv("ADMIN_EMAILS", "equipe@gibson.com");
  vi.stubEnv("CASA_EMAILS", ` ${DONO.toUpperCase()} `);
  sessao.cookies = {};
});

describe("quem entra no app da casa", () => {
  it("CASA_EMAILS e também a equipe (ADMIN_EMAILS); mais ninguém", async () => {
    expect(emailDaCasa(DONO)).toBe(true);
    expect(emailDaCasa("Equipe@Gibson.com")).toBe(true);
    expect(emailDaCasa("cliente@x.com")).toBe(false);
    expect(await sessaoCasaValida(await criarSessao(DONO, "casa"))).toBe(true);
    vi.stubEnv("CASA_EMAILS", "");
    expect(await sessaoCasaValida(await criarSessao(DONO, "casa"))).toBe(false); // tirou da lista: perde o acesso na hora
  });

  it("login: e-mail fora das listas é recusado sem nem consultar a senha", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    expect(await verificarLoginCasa("cliente@x.com", "qualquer")).toBe(false);
  });
});

describe("middleware: app da casa e painel separados", () => {
  const req = (caminho: string, cookies: Record<string, string> = {}) =>
    new NextRequest(`http://localhost${caminho}`, { headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") } });
  const passou = (r: Response) => r.headers.get("x-middleware-next") === "1";

  it("sem login: /casa vai para o login, a API responde 401; login e manifest ficam abertos", async () => {
    const r = await middleware(req("/casa"));
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toContain("/casa/login");
    expect((await middleware(req("/api/casa/reservas"))).status).toBe(401);
    for (const aberto of ["/casa/login", "/api/casa/login", "/casa/manifest.webmanifest", "/casa/icones/icone-192.png"]) expect(passou(await middleware(req(aberto))), aberto).toBe(true);
  });

  it("o dono entra no app, mas NÃO no painel (nem copiando o cookie para o do painel)", async () => {
    const c = await criarSessao(DONO, "casa");
    expect(passou(await middleware(req("/casa", { [COOKIE_CASA]: c })))).toBe(true);
    expect(passou(await middleware(req("/api/casa/reservas", { [COOKIE_CASA]: c })))).toBe(true);
    expect((await middleware(req("/admin", { [COOKIE_CASA]: c }))).status).toBe(307);
    expect((await middleware(req("/api/admin/reservas", { [COOKIE_CASA]: c }))).status).toBe(401);
    expect((await middleware(req("/api/admin/reservas", { [COOKIE_NAME]: c }))).status).toBe(401);
  });

  it("o cookie do painel não abre o app da casa (cada um entra pelo seu login)", async () => {
    const c = await criarSessao("equipe@gibson.com");
    expect((await middleware(req("/api/casa/reservas", { [COOKIE_NAME]: c }))).status).toBe(401);
    expect((await middleware(req("/api/casa/reservas", { [COOKIE_CASA]: c }))).status).toBe(401); // assinatura de painel não vale na casa
  });

  it("nem para a equipe: o cookie da CASA de um e-mail do painel, copiado para o cookie do painel, não abre o painel", async () => {
    const c = await criarSessao("equipe@gibson.com", "casa");
    expect(passou(await middleware(req("/api/casa/reservas", { [COOKIE_CASA]: c })))).toBe(true);
    expect((await middleware(req("/api/admin/reservas", { [COOKIE_NAME]: c }))).status).toBe(401);
    expect((await middleware(req("/admin", { [COOKIE_NAME]: c }))).status).toBe(307);
  });
});

/** Toda rota /api/casa (menos login e logout) recusa quem não está logado, antes de tocar em qualquer dado. */
function rotas(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? rotas(join(dir, n)) : n === "route.ts" ? [join(dir, n)] : []));
}
describe("toda rota /api/casa recusa quem não está logado", () => {
  const raiz = fileURLToPath(new URL("../src/app/api/casa", import.meta.url));
  const arquivos = rotas(raiz).filter((f) => !/[\\/](login|logout)[\\/]route\.ts$/.test(f));
  it("encontra as rotas esperadas", () => expect(arquivos.length).toBeGreaterThanOrEqual(3));
  for (const arquivo of arquivos) {
    const nome = arquivo.slice(raiz.length + 1).replace(/\\/g, "/");
    it(`${nome}: 401 em todos os métodos`, async () => {
      const m = (await import(/* @vite-ignore */ arquivo)) as Record<string, unknown>;
      for (const metodo of ["GET", "POST", "PUT", "DELETE"].filter((x) => typeof m[x] === "function")) {
        const f = m[metodo] as (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response>;
        const r = await f(new Request("http://localhost/x", { method: metodo, body: metodo === "GET" ? undefined : "{}" }), { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }) });
        expect(r.status, `${metodo} ${nome}`).toBe(401);
      }
    });
  }
});

let banco: BancoTeste;
let bancoSemTabela: BancoTeste;
beforeAll(async () => { banco = await criarBancoTeste(); bancoSemTabela = await criarBancoTeste({ casa: false }); });
afterAll(async () => { definirBanco(null); await banco.pg.close(); await bancoSemTabela.pg.close(); });

const ED = "2099-01-08";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const corpo = (o: unknown, metodo = "PUT") => new Request("http://localhost/x", { method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(o) });

describe("API de reservas do app da casa", () => {
  let mesa: string;
  beforeEach(async () => {
    definirBanco(banco);
    await banco.limpar();
    await criarEdicao(banco, { id: ED, artista: "Cibele", horario: "19h" });
    await criarEdicao(banco, { id: "2099-01-15", status: "cancelada" });
    await criarEdicao(banco, { id: "2000-01-06", status: "realizada" });
    mesa = await criarMesa(banco, "05", 4);
    sessao.cookies[COOKIE_CASA] = await criarSessao(DONO, "casa");
  });

  const reserva = async (edicao = ED, status = "aguardando") =>
    (await banco.sql<{ id: string }>("insert into reservas (edicao_id, mesa_id, nome, whatsapp, pessoas, status, codigo, expira_em) values ($1,$2,'Junior','34997107006',4,$3,'QH-123456', now() + interval '1 day') returning id", [edicao, mesa, status]))[0].id;

  it("lista só as próximas quintas (sem as canceladas e as que já passaram), os pedidos e o número das mesas", async () => {
    const id = await reserva();
    const j = await (await listar()).json();
    expect(j.edicoes.map((e: { id: string }) => e.id)).toEqual([ED]);
    expect(j.reservas).toEqual([expect.objectContaining({ id, nome: "Junior", whatsapp: "34997107006", pessoas: 4, status: "aguardando" })]);
    expect(j.mesas).toEqual([expect.objectContaining({ id: mesa, numero: "05" })]);
    expect(j.pendentes).toBe(1);
    expect(Object.keys(j.reservas[0])).not.toContain("expira_em");
  });

  it("aprovar e recusar: muda o status e registra na auditoria quem fez, com origem 'casa'", async () => {
    const id = await reserva();
    expect((await mudar(corpo({ status: "confirmada" }), ctx(id))).status).toBe(200);
    expect((await banco.sql("select status from reservas where id = $1", [id]))[0]).toEqual({ status: "confirmada" });
    const [aud] = await banco.sql<{ ator: string; detalhe: { origem: string } }>("select ator, detalhe from auditoria where acao = 'reserva_status_alterado'");
    expect(aud.ator).toBe(DONO);
    expect(aud.detalhe.origem).toBe("casa");
    expect((await mudar(corpo({ status: "cancelada" }), ctx(id))).status).toBe(200);
  });

  it("não aceita outro status, id inválido, reserva inexistente nem quinta que já passou", async () => {
    const id = await reserva();
    expect((await mudar(corpo({ status: "aguardando" }), ctx(id))).status).toBe(400);
    expect((await mudar(corpo({ status: "confirmada" }), ctx("abc"))).status).toBe(404);
    expect((await mudar(corpo({ status: "confirmada" }), ctx("00000000-0000-4000-8000-000000000000"))).status).toBe(404);
    const antiga = await reserva("2000-01-06", "confirmada");
    expect((await mudar(corpo({ status: "cancelada" }), ctx(antiga))).status).toBe(403);
    expect((await banco.sql("select status from reservas where id = $1", [antiga]))[0]).toEqual({ status: "confirmada" });
  });
});

describe("avisos de pedido novo (Web Push)", () => {
  beforeEach(async () => {
    definirBanco(banco);
    await banco.limpar();
    push.envios = [];
    push.falharCom = null;
    sessao.cookies[COOKIE_CASA] = await criarSessao(DONO, "casa");
  });

  it("só aceita inscrição de serviço de push de navegador (nunca um endereço qualquer)", () => {
    expect(validarInscricao({ endpoint: FCM, keys: CHAVES })).toEqual({ endpoint: FCM, keys: CHAVES });
    expect(validarInscricao({ endpoint: "https://web.push.apple.com/abc", keys: CHAVES })).not.toBeNull();
    expect(validarInscricao({ endpoint: "https://meusite.com/abc", keys: CHAVES })).toBeNull();
    expect(validarInscricao({ endpoint: "http://fcm.googleapis.com/x", keys: CHAVES })).toBeNull();
    expect(validarInscricao({ endpoint: FCM, keys: { p256dh: "<script>", auth: "x" } })).toBeNull();
    expect(validarInscricao(null)).toBeNull();
  });

  it("sem chaves VAPID: indisponível, não salva e não envia nada", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(await (await pushConfig()).json()).toEqual({ disponivel: false, chavePublica: null });
    expect((await pushEntrar(corpo({ inscricao: { endpoint: FCM, keys: CHAVES } }, "POST"))).status).toBe(503);
    expect(await notificarCasa({ titulo: "t", corpo: "c", url: "/casa" })).toEqual({ enviados: 0, removidos: 0 });
  });

  it("com chaves: o celular se inscreve, recebe o aviso e, se o navegador descartou a inscrição (410), ela é apagada", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U");
    vi.stubEnv("VAPID_PRIVATE_KEY", "UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls");
    expect((await (await pushConfig()).json()).disponivel).toBe(true);
    expect((await pushEntrar(corpo({ inscricao: { endpoint: "https://evil.com/x", keys: CHAVES } }, "POST"))).status).toBe(400);
    expect((await pushEntrar(corpo({ inscricao: { endpoint: FCM, keys: CHAVES } }, "POST"))).status).toBe(200);
    expect(await banco.sql("select endpoint, email from casa_push")).toEqual([{ endpoint: FCM, email: DONO }]);

    expect(await notificarCasa({ titulo: "Novo pedido de mesa", corpo: "Mesa 05 · 4 pessoas", url: "/casa" })).toEqual({ enviados: 1, removidos: 0 });
    expect(push.envios.map((e) => e.endpoint)).toEqual([FCM]);

    // Quem sai da lista perde também os avisos: a inscrição é apagada sem envio.
    await banco.sql("insert into casa_push (endpoint, p256dh, auth, email) values ($1, $2, $3, 'ex-gerente@florindos.com')", ["https://fcm.googleapis.com/fcm/send/outro", CHAVES.p256dh, CHAVES.auth]);
    push.envios = [];
    expect(await notificarCasa({ titulo: "t", corpo: "c", url: "/casa" })).toEqual({ enviados: 1, removidos: 1 });
    expect(push.envios.map((e) => e.endpoint)).toEqual([FCM]);

    push.falharCom = 410;
    expect(await notificarCasa({ titulo: "t", corpo: "c", url: "/casa" })).toEqual({ enviados: 0, removidos: 1 });
    expect(await banco.sql("select * from casa_push")).toEqual([]);
  });

  it("desligar os avisos apaga a inscrição; sem a tabela (migração não aplicada) avisa com 503", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U");
    vi.stubEnv("VAPID_PRIVATE_KEY", "UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls");
    await pushEntrar(corpo({ inscricao: { endpoint: FCM, keys: CHAVES } }, "POST"));
    // Outra pessoa logada não desliga o aviso do celular do dono.
    sessao.cookies[COOKIE_CASA] = await criarSessao("equipe@gibson.com", "casa");
    await pushSair(corpo({ endpoint: FCM }, "DELETE"));
    expect((await banco.sql("select email from casa_push"))).toEqual([{ email: DONO }]);
    sessao.cookies[COOKIE_CASA] = await criarSessao(DONO, "casa");
    expect((await pushSair(corpo({ endpoint: FCM }, "DELETE"))).status).toBe(200);
    expect(await banco.sql("select * from casa_push")).toEqual([]);

    definirBanco(bancoSemTabela);
    await bancoSemTabela.limpar();
    expect((await pushEntrar(corpo({ inscricao: { endpoint: FCM, keys: CHAVES } }, "POST"))).status).toBe(503);
  });
});

describe("app instalável e mensagem do WhatsApp", () => {
  it("manifest próprio: abre em /casa, fica em /casa, com ícones PNG e um maskable", async () => {
    const m = await (await manifest()).json();
    expect(m).toMatchObject({ start_url: "/casa", scope: "/casa", display: "standalone" });
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(m.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
  });

  it("o site público continua com o manifest dele (abre em /), separado do app da casa", async () => {
    expect(await (await manifestDoSite()).json()).toMatchObject({ start_url: "/", display: "standalone" });
  });

  it("link do WhatsApp do cliente com a mensagem certa para cada situação", () => {
    const r = { nome: "Junior Gibson", whatsapp: "34997107006", pessoas: 4, codigo: "QH-123456" };
    const ed = { data: "2026-10-08", horario: "19h", local: "Florindos Bar" };
    const ok = decodeURIComponent(linkWhatsappCliente({ ...r, status: "confirmada" }, ed, "05"));
    expect(ok).toContain("https://wa.me/5534997107006?text=");
    expect(ok).toContain("Olá, Junior! Sua reserva na QUINTA HITS está confirmada: mesa 05 para 4 pessoa(s), quinta 08/10, a partir das 19h no Florindos Bar. Código QH-123456.");
    expect(decodeURIComponent(linkWhatsappCliente({ ...r, status: "cancelada" }, ed, "05"))).toContain("não conseguimos confirmar a mesa 05");
    expect(decodeURIComponent(linkWhatsappCliente({ ...r, status: "aguardando" }, ed, "05"))).toContain("Recebemos seu pedido da mesa 05");
  });
});
