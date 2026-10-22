import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoTeste, type BancoTeste } from "./helpers/bancoTeste";
import { definirBanco } from "./helpers/holder";

vi.mock("@/lib/supabaseAdmin", async () => {
  const h = await import("./helpers/holder");
  return { supabaseAdmin: () => h.bancoAtual().supabase };
});
const cookies = vi.hoisted(() => ({ valores: {} as Record<string, string> }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (cookies.valores[n] ? { value: cookies.valores[n] } : undefined) }) }));
const contas = vi.hoisted(() => ({ criadas: [] as string[], removidas: [] as string[] }));
vi.mock("@/lib/contasAuth", async (orig) => ({
  ...(await orig<typeof import("@/lib/contasAuth")>()),
  criarOuTrocarSenha: vi.fn(async (email: string) => {
    contas.criadas.push(email);
    return "criada";
  }),
  removerConta: vi.fn(async (email: string) => {
    contas.removidas.push(email);
    return true;
  }),
}));

import { COOKIE_NAME, criarSessao } from "@/lib/adminAuth";
import { COOKIE_CASA } from "@/lib/casaAuth";
import { acessoDoEmail } from "@/lib/acessos";
import { exigirSessao } from "@/lib/adminSessao";
import { casasDaSessao, exigirSessaoCasa } from "@/lib/casaSessao";
import { DELETE as remover, GET as listar, POST as incluir, PUT as alterar } from "@/app/api/admin/usuarios/route";

let banco: BancoTeste;
beforeAll(async () => { banco = await criarBancoTeste(); });
afterAll(async () => { definirBanco(null); await banco.pg.close(); });

const DONO = "dono@gibson.com";
const json = (metodo: string, corpo: unknown) => new Request("http://localhost/api/admin/usuarios", { method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });

beforeEach(async () => {
  definirBanco(banco);
  await banco.limpar();
  vi.stubEnv("ADMIN_SESSION_SECRET", "segredo-de-teste-com-mais-de-32-caracteres!!");
  vi.stubEnv("ADMIN_EMAILS", DONO);
  vi.stubEnv("CASA_EMAILS", "florindos@bar.com");
  vi.stubEnv("CASA_EMAILS_HARLEY_GRILL", "");
  cookies.valores = { [COOKIE_NAME]: await criarSessao(DONO) };
  contas.criadas = [];
  contas.removidas = [];
});

describe("usuários cadastrados pelo painel", () => {
  it("dono inclui: login criado no Supabase Auth e acesso valendo (painel ou só o app das casas escolhidas)", async () => {
    expect((await incluir(json("POST", { email: " Ana@Porta.com ", nome: "Ana", senha: "porta2026x", painel: false, casas: ["harley-grill", "inexistente"] }))).status).toBe(201);
    expect(contas.criadas).toEqual(["ana@porta.com"]);
    expect(await acessoDoEmail("ana@porta.com")).toMatchObject({ painel: false, casas: ["harley-grill"], fixo: false, gerenciaUsuarios: false });
    expect((await incluir(json("POST", { email: "gerente@gibson.com", senha: "gerente2026", painel: true }))).status).toBe(201);
    expect(await acessoDoEmail("gerente@gibson.com")).toMatchObject({ painel: true, casas: ["quinta-hits", "harley-grill"], gerenciaUsuarios: false });
    const lista = await (await listar()).json();
    expect(lista.podeGerenciar).toBe(true);
    expect(lista.fixos.map((f: { email: string }) => f.email).sort()).toEqual([DONO, "florindos@bar.com"]);
    expect(lista.cadastrados.map((u: { email: string }) => u.email)).toEqual(["ana@porta.com", "gerente@gibson.com"]);
  });

  it("recusa: senha fraca, sem acesso nenhum, e-mail inválido e conta fixa", async () => {
    expect((await incluir(json("POST", { email: "x@y.com", senha: "1234567", casas: ["quinta-hits"] }))).status).toBe(400);
    expect((await incluir(json("POST", { email: "x@y.com", senha: "abcdefgh", casas: ["quinta-hits"] }))).status).toBe(400); // sem número
    expect((await incluir(json("POST", { email: "x@y.com", senha: "abcd1234", casas: [] }))).status).toBe(400);
    expect((await incluir(json("POST", { email: "não é email", senha: "abcd1234", casas: ["quinta-hits"] }))).status).toBe(400);
    expect((await incluir(json("POST", { email: "florindos@bar.com", senha: "abcd1234", casas: ["quinta-hits"] }))).status).toBe(409);
    expect(contas.criadas).toEqual([]);
  });

  it("só o dono (conta fixa do painel) gerencia; usuário com painel cadastrado só consulta", async () => {
    await incluir(json("POST", { email: "gerente@gibson.com", senha: "gerente2026", painel: true }));
    cookies.valores = { [COOKIE_NAME]: await criarSessao("gerente@gibson.com") };
    expect(await exigirSessao()).toBeNull(); // entra no painel
    expect((await (await listar()).json()).podeGerenciar).toBe(false);
    expect((await incluir(json("POST", { email: "outro@x.com", senha: "abcd1234", painel: true }))).status).toBe(403);
    expect((await remover(new Request(`http://localhost/api/admin/usuarios?email=${DONO}`, { method: "DELETE" }))).status).toBe(403);
  });

  it("removido perde o acesso NA HORA (painel e app), mesmo com o cookie ainda dentro do prazo", async () => {
    await incluir(json("POST", { email: "gerente@gibson.com", senha: "gerente2026", painel: true }));
    const cookiePainel = await criarSessao("gerente@gibson.com");
    const cookieCasa = await criarSessao("gerente@gibson.com", "casa");
    cookies.valores = { [COOKIE_NAME]: cookiePainel, [COOKIE_CASA]: cookieCasa };
    expect(await exigirSessao()).toBeNull();
    expect(await exigirSessaoCasa()).toBeNull();
    cookies.valores = { [COOKIE_NAME]: await criarSessao(DONO) };
    expect((await remover(new Request("http://localhost/api/admin/usuarios?email=gerente@gibson.com", { method: "DELETE" }))).status).toBe(200);
    expect(contas.removidas).toEqual(["gerente@gibson.com"]);
    cookies.valores = { [COOKIE_NAME]: cookiePainel, [COOKIE_CASA]: cookieCasa };
    expect((await exigirSessao())?.status).toBe(401);
    expect((await exigirSessaoCasa())?.status).toBe(401);
  });

  it("editar: muda as casas e troca a senha; não deixa sem acesso nenhum; conta fixa não muda por aqui", async () => {
    await incluir(json("POST", { email: "ana@porta.com", senha: "porta2026x", casas: ["quinta-hits"] }));
    cookies.valores = { [COOKIE_NAME]: await criarSessao(DONO), [COOKIE_CASA]: await criarSessao("ana@porta.com", "casa") };
    expect(await casasDaSessao()).toEqual(["quinta-hits"]);
    expect((await alterar(json("PUT", { email: "ana@porta.com", casas: ["harley-grill"], senha: "novaSenha9" }))).status).toBe(200);
    expect(await casasDaSessao()).toEqual(["harley-grill"]);
    expect(contas.criadas).toEqual(["ana@porta.com", "ana@porta.com"]);
    expect((await alterar(json("PUT", { email: "ana@porta.com", casas: [] }))).status).toBe(400);
    expect(await casasDaSessao()).toEqual(["harley-grill"]); // nada mudou
    expect((await alterar(json("PUT", { email: "florindos@bar.com", painel: true }))).status).toBe(409);
  });

  it("contas fixas (variáveis da Vercel) continuam valendo sem a tabela", async () => {
    expect(await acessoDoEmail(DONO)).toMatchObject({ painel: true, fixo: true, gerenciaUsuarios: true });
    expect(await acessoDoEmail("florindos@bar.com")).toMatchObject({ painel: false, casas: ["quinta-hits"], fixo: true });
    expect(await acessoDoEmail("ninguem@x.com")).toMatchObject({ painel: false, casas: [] });
  });
});
