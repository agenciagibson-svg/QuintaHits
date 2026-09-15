"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GENERO_VALORES, STATUS_VALORES, type Edicao } from "@/lib/edicao";

type Config = {
  casa_endereco?: string;
  casa_bairro?: string;
  casa_instagram?: string;
  reserva_url?: string;
  horario_padrao?: string;
};

const STATUS_OPCOES = STATUS_VALORES;
const GENERO_OPCOES = GENERO_VALORES;

const EDICAO_VAZIA = {
  data: "",
  artista: "",
  instagram: "",
  tema: "",
  genero: "",
  horario: "",
  local: "",
  status: "a_confirmar" as Edicao["status"],
  destaque: "",
};

export default function AdminDashboard() {
  const router = useRouter();
  const [edicoes, setEdicoes] = useState<Edicao[]>([]);
  const [config, setConfig] = useState<Config>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [novaEdicao, setNovaEdicao] = useState({ ...EDICAO_VAZIA });
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});

  /** Sessão expirada: volta para o login em vez de mostrar erro genérico. */
  function sessaoExpirou(res: Response): boolean {
    if (res.status !== 401) return false;
    router.replace("/admin/login");
    return true;
  }

  async function carregarTudo() {
    setCarregando(true);
    setErro("");
    try {
      const [resEd, resCfg] = await Promise.all([fetch("/api/admin/edicoes"), fetch("/api/admin/config")]);
      if (sessaoExpirou(resEd) || sessaoExpirou(resCfg)) return;
      if (!resEd.ok || !resCfg.ok) throw new Error("Falha ao carregar dados.");
      const jEd = await resEd.json();
      const jCfg = await resCfg.json();
      setEdicoes(jEd.edicoes ?? []);
      setConfig(jCfg.config ?? {});
    } catch {
      setErro("Não foi possível carregar os dados. Tente recarregar a página.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarTudo();
  }, []);

  function avisar(texto: string) {
    setMsg(texto);
    setTimeout(() => setMsg(""), 3000);
  }

  async function sair() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  async function criarEdicao(e: React.FormEvent) {
    e.preventDefault();
    if (!novaEdicao.data) return;
    const res = await fetch("/api/admin/edicoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(novaEdicao),
    });
    if (!res.ok) {
      if (sessaoExpirou(res)) return;
      const j = await res.json().catch(() => ({}));
      setErro(j.erro || "Não foi possível criar a edição.");
      return;
    }
    setNovaEdicao({ ...EDICAO_VAZIA });
    avisar("Edição criada.");
    carregarTudo();
  }

  function iniciarEdicao(ed: Edicao) {
    setEditandoId(ed.id);
    setRascunho({ ...ed });
  }

  async function salvarEdicao(id: string) {
    const res = await fetch(`/api/admin/edicoes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rascunho),
    });
    if (!res.ok) {
      if (sessaoExpirou(res)) return;
      const j = await res.json().catch(() => ({}));
      setErro(j.erro || "Não foi possível salvar.");
      return;
    }
    setEditandoId(null);
    avisar("Edição salva.");
    carregarTudo();
  }

  async function excluirEdicao(id: string) {
    if (!confirm(`Excluir a edição de ${id}? Essa ação não pode ser desfeita.`)) return;
    const res = await fetch(`/api/admin/edicoes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      if (sessaoExpirou(res)) return;
      const j = await res.json().catch(() => ({}));
      setErro(j.erro || "Não foi possível excluir.");
      return;
    }
    avisar("Edição excluída.");
    carregarTudo();
  }

  async function salvarConfig(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      if (sessaoExpirou(res)) return;
      const j = await res.json().catch(() => ({}));
      setErro(j.erro || "Não foi possível salvar a configuração.");
      return;
    }
    avisar("Configuração da casa salva.");
  }

  if (carregando) return <div style={s.pagina}>Carregando…</div>;

  return (
    <div style={s.pagina}>
      <header style={s.topo}>
        <h1 style={s.h1}>QUINTA HITS — Painel</h1>
        <button onClick={sair} style={s.botaoSair}>Sair</button>
      </header>

      {msg && <div style={s.aviso}>{msg}</div>}
      {erro && <div style={s.avisoErro}>{erro}</div>}

      {/* CONFIG DA CASA */}
      <section style={s.secao}>
        <h2 style={s.h2}>Casa &amp; reserva</h2>
        <p style={s.legenda}>Endereço, bairro, Instagram e link de reserva — usados em todo o site.</p>
        <form onSubmit={salvarConfig} style={s.gridConfig}>
          <label style={s.campo}>
            <span>Endereço</span>
            <input style={s.input} value={config.casa_endereco ?? ""} onChange={(e) => setConfig({ ...config, casa_endereco: e.target.value })} placeholder="Rua Exemplo, 123" />
          </label>
          <label style={s.campo}>
            <span>Bairro</span>
            <input style={s.input} value={config.casa_bairro ?? ""} onChange={(e) => setConfig({ ...config, casa_bairro: e.target.value })} placeholder="Centro" />
          </label>
          <label style={s.campo}>
            <span>Instagram da casa</span>
            <input style={s.input} value={config.casa_instagram ?? ""} onChange={(e) => setConfig({ ...config, casa_instagram: e.target.value })} placeholder="florindosbar (sem @)" />
          </label>
          <label style={s.campo}>
            <span>Link de reserva</span>
            <input style={s.input} value={config.reserva_url ?? ""} onChange={(e) => setConfig({ ...config, reserva_url: e.target.value })} placeholder="https://..." />
          </label>
          <label style={s.campo}>
            <span>Horário padrão</span>
            <input style={s.input} value={config.horario_padrao ?? ""} onChange={(e) => setConfig({ ...config, horario_padrao: e.target.value })} placeholder="20h" />
          </label>
          <button type="submit" style={s.botaoSalvar}>Salvar configuração</button>
        </form>
      </section>

      {/* NOVA EDIÇÃO */}
      <section style={s.secao}>
        <h2 style={s.h2}>Nova edição</h2>
        <form onSubmit={criarEdicao} style={s.gridNova}>
          <label style={s.campo}>
            <span>Data</span>
            <input style={s.input} type="date" value={novaEdicao.data} onChange={(e) => setNovaEdicao({ ...novaEdicao, data: e.target.value })} required />
          </label>
          <label style={s.campo}>
            <span>Artista</span>
            <input style={s.input} value={novaEdicao.artista} onChange={(e) => setNovaEdicao({ ...novaEdicao, artista: e.target.value })} />
          </label>
          <label style={s.campo}>
            <span>Instagram do artista</span>
            <input style={s.input} value={novaEdicao.instagram} onChange={(e) => setNovaEdicao({ ...novaEdicao, instagram: e.target.value })} />
          </label>
          <label style={s.campo}>
            <span>Tema</span>
            <input style={s.input} value={novaEdicao.tema} onChange={(e) => setNovaEdicao({ ...novaEdicao, tema: e.target.value })} />
          </label>
          <label style={s.campo}>
            <span>Gênero</span>
            <select style={s.input} value={novaEdicao.genero} onChange={(e) => setNovaEdicao({ ...novaEdicao, genero: e.target.value })}>
              {GENERO_OPCOES.map((g) => <option key={g} value={g}>{g || "—"}</option>)}
            </select>
          </label>
          <label style={s.campo}>
            <span>Horário</span>
            <input style={s.input} value={novaEdicao.horario} onChange={(e) => setNovaEdicao({ ...novaEdicao, horario: e.target.value })} placeholder="20h" />
          </label>
          <label style={s.campo}>
            <span>Local</span>
            <input style={s.input} value={novaEdicao.local} onChange={(e) => setNovaEdicao({ ...novaEdicao, local: e.target.value })} placeholder="Florindos Bar" />
          </label>
          <label style={s.campo}>
            <span>Status</span>
            <select style={s.input} value={novaEdicao.status} onChange={(e) => setNovaEdicao({ ...novaEdicao, status: e.target.value as Edicao["status"] })}>
              {STATUS_OPCOES.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
          </label>
          <label style={{ ...s.campo, gridColumn: "1 / -1" }}>
            <span>Destaque (ex: &quot;primeira quinta no Florindos Bar&quot;)</span>
            <input style={s.input} value={novaEdicao.destaque} onChange={(e) => setNovaEdicao({ ...novaEdicao, destaque: e.target.value })} />
          </label>
          <button type="submit" style={s.botaoSalvar}>Criar edição</button>
        </form>
      </section>

      {/* LISTA DE EDIÇÕES */}
      <section style={s.secao}>
        <h2 style={s.h2}>Edições cadastradas ({edicoes.length})</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={s.tabela}>
            <thead>
              <tr>
                {["Data", "Artista", "Tema", "Gênero", "Local", "Status", "Destaque", ""].map((c) => (
                  <th key={c} style={s.th}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {edicoes.map((ed) => {
                const editando = editandoId === ed.id;
                return (
                  <tr key={ed.id}>
                    <td style={s.td}>{ed.data}</td>
                    <td style={s.td}>
                      {editando ? <input style={s.inputCelula} value={rascunho.artista ?? ""} onChange={(e) => setRascunho({ ...rascunho, artista: e.target.value })} /> : ed.artista || "—"}
                    </td>
                    <td style={s.td}>
                      {editando ? <input style={s.inputCelula} value={rascunho.tema ?? ""} onChange={(e) => setRascunho({ ...rascunho, tema: e.target.value })} /> : ed.tema || "—"}
                    </td>
                    <td style={s.td}>
                      {editando ? (
                        <select style={s.inputCelula} value={rascunho.genero ?? ""} onChange={(e) => setRascunho({ ...rascunho, genero: e.target.value })}>
                          {GENERO_OPCOES.map((g) => <option key={g} value={g}>{g || "—"}</option>)}
                        </select>
                      ) : ed.genero || "—"}
                    </td>
                    <td style={s.td}>
                      {editando ? <input style={s.inputCelula} value={rascunho.local ?? ""} onChange={(e) => setRascunho({ ...rascunho, local: e.target.value })} /> : ed.local || "—"}
                    </td>
                    <td style={s.td}>
                      {editando ? (
                        <select style={s.inputCelula} value={rascunho.status ?? ""} onChange={(e) => setRascunho({ ...rascunho, status: e.target.value })}>
                          {STATUS_OPCOES.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                      ) : ed.status}
                    </td>
                    <td style={s.td}>
                      {editando ? <input style={s.inputCelula} value={rascunho.destaque ?? ""} onChange={(e) => setRascunho({ ...rascunho, destaque: e.target.value })} /> : ed.destaque || "—"}
                    </td>
                    <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                      {editando ? (
                        <>
                          <button style={s.botaoMini} onClick={() => salvarEdicao(ed.id)}>Salvar</button>
                          <button style={s.botaoMiniOutline} onClick={() => setEditandoId(null)}>Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button style={s.botaoMiniOutline} onClick={() => iniciarEdicao(ed)}>Editar</button>
                          <button style={s.botaoMiniPerigo} onClick={() => excluirEdicao(ed.id)}>Excluir</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  pagina: { minHeight: "100vh", background: "#171717", color: "#F1E7D2", padding: "24px 20px 60px", fontFamily: "system-ui, sans-serif" },
  topo: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, maxWidth: 1100, marginInline: "auto" },
  h1: { margin: 0, fontSize: 22 },
  h2: { margin: "0 0 4px", fontSize: 17, color: "#D5A62A" },
  legenda: { margin: "0 0 16px", fontSize: 13, opacity: 0.8 },
  botaoSair: { background: "transparent", border: "1px solid #F1E7D2", color: "#F1E7D2", borderRadius: 8, padding: "6px 14px", cursor: "pointer" },
  aviso: { maxWidth: 1100, marginInline: "auto", background: "#17352B", color: "#fff", padding: "8px 14px", borderRadius: 8, marginBottom: 16, fontSize: 14 },
  avisoErro: { maxWidth: 1100, marginInline: "auto", background: "#B84A32", color: "#fff", padding: "8px 14px", borderRadius: 8, marginBottom: 16, fontSize: 14 },
  secao: { maxWidth: 1100, marginInline: "auto", background: "#1f1f1f", borderRadius: 12, padding: 20, marginBottom: 20 },
  gridConfig: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "end" },
  gridNova: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, alignItems: "end" },
  campo: { display: "flex", flexDirection: "column", gap: 4, fontSize: 13 },
  input: { padding: "8px 10px", borderRadius: 6, border: "1px solid #444", background: "#111", color: "#F1E7D2" },
  botaoSalvar: { gridColumn: "1 / -1", background: "#B84A32", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", cursor: "pointer", fontWeight: 600, marginTop: 4 },
  tabela: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #444", color: "#D5A62A" },
  td: { padding: "8px 10px", borderBottom: "1px solid #2a2a2a" },
  inputCelula: { width: "100%", padding: "4px 6px", borderRadius: 4, border: "1px solid #444", background: "#111", color: "#F1E7D2", fontSize: 13 },
  botaoMini: { background: "#17352B", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", marginRight: 6, cursor: "pointer", fontSize: 12 },
  botaoMiniOutline: { background: "transparent", color: "#F1E7D2", border: "1px solid #666", borderRadius: 6, padding: "4px 10px", marginRight: 6, cursor: "pointer", fontSize: 12 },
  botaoMiniPerigo: { background: "transparent", color: "#B84A32", border: "1px solid #B84A32", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 },
};
