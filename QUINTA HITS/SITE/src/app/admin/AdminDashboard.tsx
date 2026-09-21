"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { s } from "./estilos";
import MesasEditor from "./MesasEditor";
import ReservasPainel from "./ReservasPainel";
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

      {/* RESERVAS */}
      <section style={s.secao}>
        <h2 style={s.h2}>Reservas de mesa</h2>
        <p style={s.legenda}>Pedidos feitos pelo site. O cliente confirma sozinho mandando o código pelo WhatsApp em até 15 min; sem mensagem, a mesa volta a ficar livre. Confirme à mão só se o cliente não conseguir enviar.</p>
        <ReservasPainel edicoes={edicoes} />
      </section>

      {/* MAPA DE MESAS */}
      <section style={s.secao}>
        <h2 style={s.h2}>Mapa de mesas</h2>
        <p style={s.legenda}>As mesas que o cliente vê e escolhe em /reservar. Mesa desativada some do site.</p>
        <MesasEditor />
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
