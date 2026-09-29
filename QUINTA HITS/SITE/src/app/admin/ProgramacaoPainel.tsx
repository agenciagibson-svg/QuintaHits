"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GENERO_VALORES, GENEROS, hojeISO, STATUS_VALORES, type Edicao } from "@/lib/edicao";
import { cor, s, selo } from "./estilos";
import { dataCurta, ROTULO_STATUS_EDICAO, TOM_STATUS_EDICAO } from "./util";

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

const rotuloGenero = (g: string) => (g ? GENEROS[g as keyof typeof GENEROS]?.rotulo ?? g : "—");

/** Programação: criar, editar e excluir edições. */
export default function ProgramacaoPainel({ edicoes, recarregar }: { edicoes: Edicao[]; recarregar: () => void }) {
  const router = useRouter();
  const [novaAberta, setNovaAberta] = useState(false);
  const [nova, setNova] = useState({ ...EDICAO_VAZIA });
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [mostrarPassadas, setMostrarPassadas] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  function avisar(t: string) {
    setErro("");
    setMsg(t);
    setTimeout(() => setMsg(""), 3000);
  }

  async function falhou(res: Response, padrao: string) {
    if (res.ok) return false;
    if (res.status === 401) { router.replace("/admin/login"); return true; }
    const j = await res.json().catch(() => ({}));
    setErro(j.erro || padrao);
    return true;
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!nova.data) return;
    const res = await fetch("/api/admin/edicoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nova) });
    if (await falhou(res, "Não foi possível criar a edição.")) return;
    setNova({ ...EDICAO_VAZIA });
    setNovaAberta(false);
    avisar("Edição criada.");
    recarregar();
  }

  async function salvar(id: string) {
    const res = await fetch(`/api/admin/edicoes/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rascunho) });
    if (await falhou(res, "Não foi possível salvar.")) return;
    setEditandoId(null);
    avisar("Edição salva.");
    recarregar();
  }

  async function excluir(ed: Edicao) {
    if (!confirm(`Excluir a edição de ${dataCurta(ed.data)}? Essa ação não pode ser desfeita.`)) return;
    const res = await fetch(`/api/admin/edicoes/${ed.id}`, { method: "DELETE" });
    if (await falhou(res, "Não foi possível excluir.")) return;
    avisar("Edição excluída.");
    recarregar();
  }

  const hoje = hojeISO();
  const futuras = edicoes.filter((e) => e.data >= hoje).sort((a, b) => a.data.localeCompare(b.data));
  const passadas = edicoes.filter((e) => e.data < hoje);
  const lista = mostrarPassadas ? [...futuras, ...passadas] : futuras;

  const campo = (k: keyof typeof rascunho, placeholder = "") => (
    <input style={s.inputCelula} value={rascunho[k] ?? ""} placeholder={placeholder} onChange={(e) => setRascunho({ ...rascunho, [k]: e.target.value })} />
  );

  return (
    <>
      {msg && <div style={s.aviso}>{msg}</div>}
      {erro && <div style={s.avisoErro}>{erro}</div>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <button type="button" style={{ ...s.botaoSalvar, marginTop: 0 }} onClick={() => setNovaAberta(!novaAberta)}>
          {novaAberta ? "Fechar" : "+ Nova edição"}
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: cor.suave, marginLeft: "auto" }}>
          <input type="checkbox" checked={mostrarPassadas} onChange={(e) => setMostrarPassadas(e.target.checked)} />
          Mostrar edições passadas ({passadas.length})
        </label>
      </div>

      {novaAberta && (
        <section style={s.secao}>
          <h2 style={s.h2}>Nova edição</h2>
          <p style={s.legenda}>Só a data é obrigatória. O resto pode ser completado depois.</p>
          <form onSubmit={criar} style={s.gridNova}>
            <label style={s.campo}><span>Data</span>
              <input style={s.input} type="date" value={nova.data} onChange={(e) => setNova({ ...nova, data: e.target.value })} required /></label>
            <label style={s.campo}><span>Artista</span>
              <input style={s.input} value={nova.artista} onChange={(e) => setNova({ ...nova, artista: e.target.value })} /></label>
            <label style={s.campo}><span>Instagram do artista</span>
              <input style={s.input} value={nova.instagram} onChange={(e) => setNova({ ...nova, instagram: e.target.value })} placeholder="sem @" /></label>
            <label style={s.campo}><span>Tema</span>
              <input style={s.input} value={nova.tema} onChange={(e) => setNova({ ...nova, tema: e.target.value })} /></label>
            <label style={s.campo}><span>Gênero</span>
              <select style={s.input} value={nova.genero} onChange={(e) => setNova({ ...nova, genero: e.target.value })}>
                {GENERO_VALORES.map((g) => <option key={g} value={g}>{rotuloGenero(g)}</option>)}
              </select></label>
            <label style={s.campo}><span>Horário</span>
              <input style={s.input} value={nova.horario} onChange={(e) => setNova({ ...nova, horario: e.target.value })} placeholder="20h" /></label>
            <label style={s.campo}><span>Local</span>
              <input style={s.input} value={nova.local} onChange={(e) => setNova({ ...nova, local: e.target.value })} placeholder="Florindos Bar" /></label>
            <label style={s.campo}><span>Status</span>
              <select style={s.input} value={nova.status} onChange={(e) => setNova({ ...nova, status: e.target.value as Edicao["status"] })}>
                {STATUS_VALORES.map((st) => <option key={st} value={st}>{ROTULO_STATUS_EDICAO[st]}</option>)}
              </select></label>
            <label style={{ ...s.campo, gridColumn: "1 / -1" }}><span>Destaque (ex.: &quot;primeira quinta no Florindos Bar&quot;)</span>
              <input style={s.input} value={nova.destaque} onChange={(e) => setNova({ ...nova, destaque: e.target.value })} /></label>
            <button type="submit" style={s.botaoSalvar}>Criar edição</button>
          </form>
        </section>
      )}

      <section style={{ ...s.secao, padding: 0, overflow: "hidden" }}>
        {lista.length === 0 ? (
          <p style={{ ...s.legenda, padding: 22, margin: 0 }}>Nenhuma edição futura. Crie a próxima em “+ Nova edição”.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={s.tabela} className="qh-tabela">
              <thead>
                <tr>{["Data", "Atração", "Gênero", "Horário", "Local", "Status", ""].map((c) => <th key={c} style={s.th}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {lista.map((ed) => {
                  const editando = editandoId === ed.id;
                  const passada = ed.data < hoje;
                  return (
                    <tr key={ed.id} style={passada && !editando ? { opacity: 0.55 } : undefined}>
                      <td style={{ ...s.td, whiteSpace: "nowrap", fontWeight: 600 }}>{dataCurta(ed.data)}</td>
                      <td style={s.td}>
                        {editando ? (
                          <div style={{ display: "grid", gap: 6, minWidth: 200 }}>
                            {campo("artista", "Artista")}
                            {campo("tema", "Tema")}
                            {campo("destaque", "Destaque")}
                          </div>
                        ) : (
                          <>
                            <div style={{ fontWeight: 600 }}>{ed.artista || <span style={{ color: cor.suave }}>A definir</span>}</div>
                            {(ed.tema || ed.destaque) && <div style={{ fontSize: 12, color: cor.suave }}>{[ed.tema, ed.destaque].filter(Boolean).join(" · ")}</div>}
                          </>
                        )}
                      </td>
                      <td style={s.td}>
                        {editando ? (
                          <select style={s.inputCelula} value={rascunho.genero ?? ""} onChange={(e) => setRascunho({ ...rascunho, genero: e.target.value })}>
                            {GENERO_VALORES.map((g) => <option key={g} value={g}>{rotuloGenero(g)}</option>)}
                          </select>
                        ) : rotuloGenero(ed.genero)}
                      </td>
                      <td style={s.td}>{editando ? campo("horario", "20h") : ed.horario || "—"}</td>
                      <td style={s.td}>{editando ? campo("local", "Florindos Bar") : ed.local || "—"}</td>
                      <td style={s.td}>
                        {editando ? (
                          <select style={s.inputCelula} value={rascunho.status ?? ""} onChange={(e) => setRascunho({ ...rascunho, status: e.target.value })}>
                            {STATUS_VALORES.map((st) => <option key={st} value={st}>{ROTULO_STATUS_EDICAO[st]}</option>)}
                          </select>
                        ) : <span style={selo(TOM_STATUS_EDICAO[ed.status])}>{ROTULO_STATUS_EDICAO[ed.status]}</span>}
                      </td>
                      <td style={{ ...s.td, whiteSpace: "nowrap", textAlign: "right" }}>
                        {editando ? (
                          <>
                            <button style={s.botaoMini} onClick={() => salvar(ed.id)}>Salvar</button>
                            <button style={{ ...s.botaoMiniOutline, marginRight: 0 }} onClick={() => setEditandoId(null)}>Cancelar</button>
                          </>
                        ) : (
                          <>
                            <button style={s.botaoMiniOutline} onClick={() => { setEditandoId(ed.id); setRascunho({ ...ed }); }}>Editar</button>
                            <button style={{ ...s.botaoMiniPerigo, marginRight: 0 }} onClick={() => excluir(ed)}>Excluir</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
