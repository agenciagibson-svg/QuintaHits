"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cor, s, selo } from "./estilos";
import { CASAS, CASA_IDS, type CasaId } from "@/config/casas";

type Usuario = { email: string; nome: string; painel: boolean; casas: CasaId[]; vercel: boolean; criado_por: string | null; criado_em: string | null };
type Dados = { responsaveis: string[]; usuarios: Usuario[]; tabela: boolean; podeGerenciar: boolean; voce: string };
type Edicao = { email: string; painel: boolean; casas: CasaId[]; senha: string };

const CASAS_APP = CASA_IDS.filter((c) => CASAS[c].reservas);

/** Senha aleatória fácil de ditar: letras sem as parecidas (l, I, O) + números. */
function gerarSenha(): string {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const numeros = "23456789";
  const todos = letras + numeros;
  const r = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  let senha = letras[r(letras.length)] + numeros[r(numeros.length)];
  for (let i = 0; i < 8; i++) senha += todos[r(todos.length)];
  return senha
    .split("")
    .sort(() => (crypto.getRandomValues(new Uint8Array(1))[0] > 127 ? 1 : -1))
    .join("");
}

function Acessos({ painel, casas }: { painel: boolean; casas: CasaId[] }) {
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
      {painel && <span style={selo("ok")}>Painel (tudo)</span>}
      {(painel ? CASAS_APP : casas).map((c) => (
        <span key={c} style={selo("neutro")}>App · {CASAS[c].nome}</span>
      ))}
    </span>
  );
}

/** Escolha do acesso: painel completo OU só o app de reservas de algumas casas. */
function EscolhaAcesso({ painel, casas, mudar }: { painel: boolean; casas: CasaId[]; mudar: (p: boolean, c: CasaId[]) => void }) {
  return (
    <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input type="radio" checked={painel} onChange={() => mudar(true, [])} />
        <span><strong>Painel completo</strong> — tudo do painel e o app de reservas de todas as casas.</span>
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input type="radio" checked={!painel} onChange={() => mudar(false, casas.length ? casas : [CASAS_APP[0]])} />
        <span><strong>Só o app de reservas</strong> (celular) — vê e confirma os pedidos e faz o check-in na porta, só destas casas:</span>
      </label>
      {!painel && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, paddingLeft: 26 }}>
          {CASAS_APP.map((c) => (
            <label key={c} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={casas.includes(c)} onChange={(e) => mudar(false, e.target.checked ? [...casas, c] : casas.filter((x) => x !== c))} />
              {CASAS[c].nome}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Configuração → Usuários: quem entra no painel e no app de reservas (PWA). O responsável (ADMIN_EMAILS na Vercel) é fixo;
 * todos os outros — cadastrados aqui ou vindos das variáveis da Vercel — podem ter o acesso mudado, a senha trocada ou
 * ser removidos (perdem o acesso na hora). Só o responsável inclui, edita e remove.
 */
export default function UsuariosPainel() {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [recado, setRecado] = useState("");
  const [novo, setNovo] = useState({ nome: "", email: "", senha: "", painel: false, casas: [CASAS_APP[0]] as CasaId[] });
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState<Edicao | null>(null);

  const carregar = useCallback(async () => {
    const res = await fetch("/api/admin/usuarios", { cache: "no-store" });
    if (res.status === 401) return router.replace("/admin/login");
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setErro(j.erro || "Não foi possível carregar os usuários.");
    setDados(j as Dados);
  }, [router]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function chamar(metodo: "POST" | "PUT" | "DELETE", corpo?: unknown, email?: string): Promise<boolean> {
    setErro("");
    setMsg("");
    const res = await fetch(metodo === "DELETE" ? `/api/admin/usuarios?email=${encodeURIComponent(email ?? "")}` : "/api/admin/usuarios", {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    if (res.status === 401) {
      router.replace("/admin/login");
      return false;
    }
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(j.erro || "Não foi possível salvar.");
      return false;
    }
    return true;
  }

  async function incluir(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const ok = await chamar("POST", novo);
    setSalvando(false);
    if (!ok) return;
    const onde = novo.painel ? `Painel: ${window.location.origin}/admin\nApp de reservas (celular): ${window.location.origin}/casa` : `App de reservas (abra no celular e instale): ${window.location.origin}/casa`;
    setRecado(`Olá${novo.nome ? `, ${novo.nome.split(" ")[0]}` : ""}! Seu acesso à QUINTA HITS está pronto.\n${onde}\nE-mail: ${novo.email.trim().toLowerCase()}\nSenha: ${novo.senha}`);
    setMsg(`${novo.email.trim().toLowerCase()} incluído.`);
    setNovo({ nome: "", email: "", senha: "", painel: false, casas: [CASAS_APP[0]] });
    carregar();
  }

  async function salvarEdicao() {
    if (!editando) return;
    const corpo: Record<string, unknown> = { email: editando.email, painel: editando.painel, casas: editando.casas };
    if (editando.senha) corpo.senha = editando.senha;
    if (await chamar("PUT", corpo)) {
      setMsg(editando.senha ? `Acesso de ${editando.email} salvo e senha trocada.` : `Acesso de ${editando.email} salvo.`);
      setEditando(null);
      carregar();
    }
  }

  async function remover(u: Usuario) {
    if (!confirm(`Remover ${u.email}? A pessoa perde o acesso ao painel e ao app na hora e o login dela é apagado.`)) return;
    if (await chamar("DELETE", undefined, u.email)) {
      setMsg(`${u.email} removido.`);
      carregar();
    }
  }

  if (!dados) return <p style={s.legenda}>{erro || "Carregando…"}</p>;
  const pode = dados.podeGerenciar;

  return (
    <>
      {erro && <div style={s.avisoErro}>{erro}</div>}
      {msg && <div style={s.aviso}>{msg}</div>}
      {!dados.tabela && (
        <div style={s.avisoErro}>Falta rodar no Supabase a migração de usuários (migracao-2026-10-22-usuarios.sql). Até lá, só quem está nas variáveis da Vercel entra, e não dá para editar nem remover.</div>
      )}

      {recado && (
        <section style={{ ...s.secao, borderColor: cor.mostarda }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Mande para a pessoa (a senha não aparece de novo):</div>
          <pre style={{ whiteSpace: "pre-wrap", margin: "0 0 12px", fontFamily: "inherit", fontSize: 14, color: cor.texto }}>{recado}</pre>
          <button type="button" style={s.botaoMini} onClick={() => navigator.clipboard?.writeText(recado).then(() => setMsg("Recado copiado."))}>Copiar recado</button>
          <a style={{ ...s.botaoMiniOutline, textDecoration: "none", display: "inline-block" }} href={`https://wa.me/?text=${encodeURIComponent(recado)}`} target="_blank" rel="noopener noreferrer">Enviar pelo WhatsApp</a>
          <button type="button" style={s.botaoMiniOutline} onClick={() => setRecado("")}>Fechar</button>
        </section>
      )}

      {pode ? (
        <section style={s.secao}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Incluir usuário</div>
          <form onSubmit={incluir} style={{ display: "grid", gap: 14 }}>
            <div style={s.gridNova}>
              <label style={s.campo}><span>Nome</span><input style={s.input} value={novo.nome} maxLength={80} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex.: Ana (porta)" /></label>
              <label style={s.campo}><span>E-mail</span><input style={s.input} type="email" required value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} placeholder="pessoa@email.com" /></label>
              <label style={s.campo}>
                <span>Senha inicial (8+ letras e números)</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <input style={{ ...s.input, flex: 1, minWidth: 0 }} required value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} autoComplete="new-password" />
                  <button type="button" style={s.botaoMiniOutline} onClick={() => setNovo({ ...novo, senha: gerarSenha() })}>Gerar</button>
                </div>
              </label>
            </div>
            <EscolhaAcesso painel={novo.painel} casas={novo.casas} mudar={(painel, casas) => setNovo({ ...novo, painel, casas })} />
            <div><button type="submit" style={{ ...s.botaoSalvar, marginTop: 0 }} disabled={salvando}>{salvando ? "Incluindo…" : "Incluir usuário"}</button></div>
          </form>
        </section>
      ) : (
        <p style={s.legenda}>Só o responsável pelo sistema inclui, muda ou remove usuários. Aqui você vê quem tem acesso.</p>
      )}

      <div style={{ overflowX: "auto", background: cor.cartao, border: `1px solid ${cor.linha}`, borderRadius: 14 }}>
        <table style={s.tabela} className="qh-tabela">
          <thead>
            <tr>
              {["Usuário", "Acesso", "Origem", ""].map((c) => <th key={c} style={s.th}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {dados.responsaveis.map((email) => (
              <tr key={`r-${email}`}>
                <td style={s.td}><div style={{ fontWeight: 600 }}>{email}{email === dados.voce ? " (você)" : ""}</div></td>
                <td style={s.td}><Acessos painel casas={CASAS_APP} /></td>
                <td style={{ ...s.td, color: cor.suave }}>Responsável (Vercel)</td>
                <td style={s.td} />
              </tr>
            ))}
            {dados.usuarios.map((u) =>
              editando?.email === u.email ? (
                <tr key={u.email}>
                  <td style={s.td}><div style={{ fontWeight: 600 }}>{u.nome || u.email}</div>{u.nome && <div style={{ fontSize: 12, color: cor.suave }}>{u.email}</div>}</td>
                  <td style={s.td} colSpan={2}>
                    <EscolhaAcesso painel={editando.painel} casas={editando.casas} mudar={(painel, casas) => setEditando({ ...editando, painel, casas })} />
                    <label style={{ ...s.campo, marginTop: 10, maxWidth: 320 }}>
                      <span>Nova senha (deixe em branco para manter)</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input style={{ ...s.input, flex: 1, minWidth: 0 }} value={editando.senha} onChange={(e) => setEditando({ ...editando, senha: e.target.value })} autoComplete="new-password" />
                        <button type="button" style={s.botaoMiniOutline} onClick={() => setEditando({ ...editando, senha: gerarSenha() })}>Gerar</button>
                      </div>
                    </label>
                  </td>
                  <td style={{ ...s.td, whiteSpace: "nowrap", textAlign: "right" }}>
                    <button style={s.botaoMini} onClick={salvarEdicao}>Salvar</button>
                    <button style={{ ...s.botaoMiniOutline, marginRight: 0 }} onClick={() => setEditando(null)}>Cancelar</button>
                  </td>
                </tr>
              ) : (
                <tr key={u.email}>
                  <td style={s.td}><div style={{ fontWeight: 600 }}>{u.nome || u.email}</div>{u.nome && <div style={{ fontSize: 12, color: cor.suave }}>{u.email}</div>}</td>
                  <td style={s.td}><Acessos painel={u.painel} casas={u.casas} /></td>
                  <td style={{ ...s.td, color: cor.suave, fontSize: 13 }}>
                    {u.criado_em ? (
                      <>
                        Cadastrado {new Date(u.criado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                        {u.criado_por ? ` por ${u.criado_por}` : ""}
                      </>
                    ) : (
                      "Vercel"
                    )}
                  </td>
                  <td style={{ ...s.td, whiteSpace: "nowrap", textAlign: "right" }}>
                    {pode && (
                      <>
                        <button style={s.botaoMiniOutline} onClick={() => setEditando({ email: u.email, painel: u.painel, casas: u.casas, senha: "" })}>Editar / senha</button>
                        <button style={{ ...s.botaoMiniPerigo, marginRight: 0 }} onClick={() => remover(u)}>Remover</button>
                      </>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p style={{ ...s.legenda, marginTop: 12 }}>
        O responsável (ADMIN_EMAILS na Vercel) é fixo: ninguém se tranca fora. Os demais, inclusive os que vieram das variáveis da Vercel,
        podem ser editados e removidos aqui. Remover tira o acesso na hora, inclusive de quem já estava logado, e apaga o login.
      </p>
    </>
  );
}
