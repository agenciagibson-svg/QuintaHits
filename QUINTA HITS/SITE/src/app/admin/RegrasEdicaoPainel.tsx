"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatData, hojeISO, type Edicao } from "@/lib/edicao";
import type { CanalDaMesa } from "@/lib/regras";
import { regrasCopiadas, soAguardaAbertura, temRegras, type Prontidao, type RegrasEdicao } from "@/lib/regrasEdicao";
import { cor, s, selo } from "./estilos";

type Painel = { migrado: false } | { migrado: true; parte2: boolean; siteLigado: boolean; edicao: Edicao | null; regras: RegrasEdicao; prontidao: Prontidao; prontidaoSite: Prontidao; mesas: CanalDaMesa[] };

type Formulario = {
  abertura: string;
  reservas_ate: string;
  tolerancia_min: string;
  cancelamento_ate_horas: string;
  capacidade_maxima: string;
  consumacao: string;
  preco: string;
  sinal: string;
  instrucoes_chegada: string;
  observacoes: string;
  atendimento_automatico: boolean;
  reservas_site: boolean;
};

const FUSO = "America/Sao_Paulo";

/** Instante ISO -> "AAAA-MM-DDTHH:mm" no horário de Uberlândia, para o campo datetime-local. */
function paraCampoDataHora(iso: string | null): string {
  if (!iso) return "";
  const partes = new Intl.DateTimeFormat("sv-SE", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  return partes.replace(" ", "T");
}

/** "AAAA-MM-DDTHH:mm" (horário de Uberlândia, UTC-3 sem horário de verão) -> instante ISO. */
function deCampoDataHora(v: string): string {
  return v ? new Date(`${v}:00-03:00`).toISOString() : "";
}

const centavosParaReais = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));
function reaisParaCentavos(v: string): number | "" | null {
  if (!v.trim()) return "";
  const n = Number(v.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function formularioDe(r: RegrasEdicao): Formulario {
  return {
    abertura: r.abertura ?? "",
    reservas_ate: paraCampoDataHora(r.reservas_ate),
    tolerancia_min: r.tolerancia_min === null ? "" : String(r.tolerancia_min),
    cancelamento_ate_horas: r.cancelamento_ate_horas === null ? "" : String(r.cancelamento_ate_horas),
    capacidade_maxima: r.capacidade_maxima === null ? "" : String(r.capacidade_maxima),
    consumacao: centavosParaReais(r.consumacao_minima_centavos),
    preco: centavosParaReais(r.preco_centavos),
    sinal: centavosParaReais(r.sinal_centavos),
    instrucoes_chegada: r.instrucoes_chegada ?? "",
    observacoes: r.observacoes,
    atendimento_automatico: r.atendimento_automatico,
    reservas_site: r.reservas_site,
  };
}

function edicaoPadrao(edicoes: Edicao[]): string {
  const hoje = hojeISO();
  const futuras = edicoes.filter((e) => e.data >= hoje && e.status !== "cancelada");
  return (futuras[futuras.length - 1] ?? edicoes[0])?.id ?? "";
}

export default function RegrasEdicaoPainel({ edicoes }: { edicoes: Edicao[] }) {
  const router = useRouter();
  const [edicaoId, setEdicaoId] = useState(() => edicaoPadrao(edicoes));
  const [painel, setPainel] = useState<Painel | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [mesas, setMesas] = useState<CanalDaMesa[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [copiando, setCopiando] = useState(false);
  const ultimoPedido = useRef("");

  function aplicar(p: Painel) {
    setPainel(p);
    if (p.migrado) {
      setForm(formularioDe(p.regras));
      setMesas(p.mesas);
    }
  }

  async function carregar(id: string) {
    if (!id) return;
    ultimoPedido.current = id;
    setCarregando(true);
    setErro("");
    setMsg("");
    try {
      const res = await fetch(`/api/admin/edicoes/${id}/regras`);
      if (res.status === 401) return router.replace("/admin/login");
      if (!res.ok) throw new Error();
      const p = (await res.json()) as Painel;
      if (ultimoPedido.current === id) aplicar(p);
    } catch {
      if (ultimoPedido.current === id) setErro("Não foi possível carregar as regras desta edição.");
    } finally {
      if (ultimoPedido.current === id) setCarregando(false);
    }
  }

  useEffect(() => {
    carregar(edicaoId);
    // `carregar` só depende da edição escolhida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edicaoId]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setErro("");
    setMsg("");
    const dinheiro = { consumacao_minima_centavos: reaisParaCentavos(form.consumacao), preco_centavos: reaisParaCentavos(form.preco), sinal_centavos: reaisParaCentavos(form.sinal) };
    if (Object.values(dinheiro).includes(null)) return setErro("Informe os valores em reais, como 50,00.");

    setSalvando(true);
    try {
      const res = await fetch(`/api/admin/edicoes/${edicaoId}/regras`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regras: {
            abertura: form.abertura,
            reservas_ate: deCampoDataHora(form.reservas_ate),
            tolerancia_min: form.tolerancia_min,
            cancelamento_ate_horas: form.cancelamento_ate_horas,
            capacidade_maxima: form.capacidade_maxima,
            ...dinheiro,
            instrucoes_chegada: form.instrucoes_chegada,
            observacoes: form.observacoes,
            atendimento_automatico: form.atendimento_automatico,
            // Só envia a liberação do site se a migração parte 2 já existe neste banco (senão o salvamento falharia).
            ...(painel?.migrado && painel.parte2 ? { reservas_site: form.reservas_site } : {}),
          },
          mesas: mesas.map((m) => ({ mesa_id: m.mesa_id, disponivel_site: m.disponivel_site, disponivel_whatsapp: m.disponivel_whatsapp, disponivel_admin: m.disponivel_admin, lugares_ajuste: m.lugares_ajuste })),
        }),
      });
      if (res.status === 401) return router.replace("/admin/login");
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setErro(j.erro || "Não foi possível salvar.");
      aplicar(j as Painel);
      setMsg("Regras e canais salvos.");
    } catch {
      setErro("Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  /** Preenche o formulário com as regras da edição anterior mais recente que tenha regras. Não salva sozinho. */
  async function copiarDaAnterior() {
    const atual = edicoes.find((e) => e.id === edicaoId);
    if (!atual || !form) return;
    setErro("");
    setMsg("");
    setCopiando(true);
    try {
      const anteriores = edicoes.filter((e) => e.data < atual.data && e.status !== "cancelada").sort((a, b) => b.data.localeCompare(a.data)).slice(0, 8);
      for (const anterior of anteriores) {
        const res = await fetch(`/api/admin/edicoes/${anterior.id}/regras`);
        if (res.status === 401) return router.replace("/admin/login");
        if (!res.ok) throw new Error();
        const p = (await res.json()) as Painel;
        if (!p.migrado || !temRegras(p.regras)) continue;
        if (ultimoPedido.current !== edicaoId) return; // trocou de edição no meio do caminho
        const parte2 = painel?.migrado && painel.parte2;
        // Funcional: preserva o que foi digitado nas observações enquanto buscava. A liberação para o site só é copiada
        // se este banco já tem a parte 2 (senão a caixa fica desligada).
        setForm((f) => {
          if (!f) return f;
          const copiado = formularioDe(regrasCopiadas(p.regras, anterior.data, atual.data, f.observacoes));
          return { ...copiado, reservas_site: parte2 ? copiado.reservas_site : f.reservas_site };
        });
        setMsg(`Regras copiadas da edição de ${formatData(anterior.data, "numerica")} (inclusive as liberações). Confira, principalmente o prazo final, e clique em "Salvar regras e canais".`);
        return;
      }
      if (ultimoPedido.current === edicaoId) setErro("Nenhuma edição anterior tem regras preenchidas para copiar.");
    } catch {
      if (ultimoPedido.current === edicaoId) setErro("Não foi possível copiar as regras da edição anterior.");
    } finally {
      setCopiando(false);
    }
  }

  const trocar = (campo: keyof Formulario, valor: string | boolean) => form && setForm({ ...form, [campo]: valor });
  const mudarMesa = (id: string, mudanca: Partial<CanalDaMesa>) => setMesas(mesas.map((m) => (m.mesa_id === id ? { ...m, ...mudanca } : m)));

  if (!edicoes.length) return <p style={s.legenda}>Cadastre uma edição para configurar as regras.</p>;

  return (
    <div>
      <label style={{ ...s.campo, maxWidth: 360, marginBottom: 12 }}>
        <span>Edição</span>
        <select style={s.input} value={edicaoId} onChange={(e) => setEdicaoId(e.target.value)}>
          {edicoes.map((e) => (
            <option key={e.id} value={e.id}>
              {formatData(e.data, "numerica")}/{e.data.slice(0, 4)} — {e.artista || "sem artista"}
              {e.status === "cancelada" ? " (cancelada)" : ""}
            </option>
          ))}
        </select>
      </label>

      {carregando && <p style={s.legenda}>Carregando…</p>}
      {erro && <div style={{ ...s.avisoErro, marginInline: 0 }}>{erro}</div>}
      {msg && <div style={{ ...s.aviso, marginInline: 0 }}>{msg}</div>}

      {painel && !painel.migrado && (
        <div style={{ ...s.aviso, background: cor.alerta }}>
          Este recurso ainda não está ativo neste banco: a migração do agente de reservas não foi aplicada. Nada aqui altera as reservas atuais do site.
        </div>
      )}

      {painel?.migrado && form && (
        <form onSubmit={salvar}>
          <div className="qh-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {[
              {
                titulo: "Reservas pelo site",
                p: painel.prontidaoSite,
                ok: painel.siteLigado ? "Aberta para reservas pelo site." : "Pronta, mas as reservas pelo site estão desligadas na Vercel.",
              },
              { titulo: "Reservas pelo WhatsApp", p: painel.prontidao, ok: "Pronta para o atendimento automático." },
            ].map(({ titulo, p, ok }) => (
              <div key={titulo} className="qh-kpi" role="status">
                <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span className="qh-kpi-rotulo">{titulo}</span>
                  <span style={selo(p.pronta || soAguardaAbertura(p) ? "ok" : "alerta")}>
                    {p.pronta ? "Pronta" : soAguardaAbertura(p) ? "Agendada" : `Faltam ${p.faltando.length}`}
                  </span>
                </span>
                {p.pronta ? (
                  <span className="qh-kpi-sub">{ok}</span>
                ) : soAguardaAbertura(p) ? (
                  <span className="qh-kpi-sub">
                    Tudo pronto: as reservas abrem sozinhas {p.abreQuando}.{titulo === "Reservas pelo site" && !painel.siteLigado ? " (Atenção: as reservas pelo site estão desligadas na Vercel.)" : ""}
                  </span>
                ) : (
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13, color: cor.suave }}>
                    {p.faltando.map((f) => <li key={f}>{f}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
          {!painel.parte2 && (
            <div style={{ ...s.aviso, background: cor.alerta }} role="note">
              A migração parte 2 ainda não foi aplicada neste banco: a liberação para o site não pode ser gravada e o site continua fechado para todas as edições.
              Aplique o arquivo <code>migracao-2026-09-21-parte2-site-e-atendimento.sql</code> no SQL Editor do Supabase.
            </div>
          )}

          <section style={s.secao}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h2 style={s.h2}>Regras da noite</h2>
            <button type="button" style={s.botaoMiniOutline} onClick={copiarDaAnterior} disabled={copiando || carregando}>
              {copiando ? "Copiando…" : "Copiar regras da quinta anterior"}
            </button>
          </div>
          <p style={s.legenda}>Horário do evento e local ficam em Programação. Campo vazio significa &quot;ainda não definido&quot;.</p>
          <div style={s.gridNova}>
            <label style={s.campo}><span>Horário de abertura</span>
              <input style={s.input} value={form.abertura} onChange={(e) => trocar("abertura", e.target.value)} placeholder="19h ou 19h30" /></label>
            <label style={s.campo}><span>Prazo final para reservar</span>
              <input style={s.input} type="datetime-local" value={form.reservas_ate} onChange={(e) => trocar("reservas_ate", e.target.value)} /></label>
            <label style={s.campo}><span>Tolerância (minutos)</span>
              <input style={s.input} inputMode="numeric" value={form.tolerancia_min} onChange={(e) => trocar("tolerancia_min", e.target.value)} /></label>
            <label style={s.campo}><span>Cancelar até (horas antes)</span>
              <input style={s.input} inputMode="numeric" value={form.cancelamento_ate_horas} onChange={(e) => trocar("cancelamento_ate_horas", e.target.value)} /></label>
            <label style={s.campo}><span>Capacidade máxima (pessoas)</span>
              <input style={s.input} inputMode="numeric" value={form.capacidade_maxima} onChange={(e) => trocar("capacidade_maxima", e.target.value)} /></label>
            <label style={s.campo}><span>Consumação mínima (R$; 0 se não houver)</span>
              <input style={s.input} inputMode="decimal" value={form.consumacao} onChange={(e) => trocar("consumacao", e.target.value)} /></label>
            <label style={s.campo}><span>Preço (R$, opcional)</span>
              <input style={s.input} inputMode="decimal" value={form.preco} onChange={(e) => trocar("preco", e.target.value)} /></label>
            <label style={s.campo}><span>Sinal (R$, só informativo)</span>
              <input style={s.input} inputMode="decimal" value={form.sinal} onChange={(e) => trocar("sinal", e.target.value)} /></label>
            <label style={{ ...s.campo, gridColumn: "1 / -1" }}><span>Instruções de chegada</span>
              <textarea style={{ ...s.input, minHeight: 64 }} value={form.instrucoes_chegada} onChange={(e) => trocar("instrucoes_chegada", e.target.value)} /></label>
            <label style={{ ...s.campo, gridColumn: "1 / -1" }}><span>Observações internas</span>
              <input style={s.input} value={form.observacoes} onChange={(e) => trocar("observacoes", e.target.value)} /></label>
            <label style={{ ...s.campo, gridColumn: "1 / -1", flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.atendimento_automatico} onChange={(e) => trocar("atendimento_automatico", e.target.checked)} />
              <span>Liberar esta edição para o atendimento automático (WhatsApp)</span>
            </label>
            <label style={{ ...s.campo, gridColumn: "1 / -1", flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.reservas_site} disabled={!painel.parte2} onChange={(e) => trocar("reservas_site", e.target.checked)} />
              <span>Liberar esta edição para reservas pelo SITE (exige todos os campos acima e ao menos uma mesa oferecida ao site)</span>
            </label>
          </div>

          </section>

          <section style={s.secao}>
          <h2 style={s.h2}>Onde cada mesa pode ser oferecida</h2>
          <p style={s.legenda}>
            O estoque é um só: uma mesa reservada por qualquer canal some de todos. Aqui você só escolhe quem pode <em>oferecer</em> a mesa. Sem marcação, o site e o painel oferecem e o WhatsApp não.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={s.tabela} className="qh-tabela">
              <thead>
                <tr>
                  <th style={s.th}>Mesa</th><th style={s.th}>Lugares</th><th style={s.th}>Site</th><th style={s.th}>WhatsApp</th>
                  <th style={s.th}>Painel</th><th style={s.th}>Ajuste de lugares</th><th style={s.th}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {mesas.map((m) => {
                  const indisponivel = !m.disponivel_site && !m.disponivel_whatsapp && !m.disponivel_admin;
                  return (
                    <tr key={m.mesa_id}>
                      <td style={s.td}>{m.numero}{m.area ? ` · ${m.area}` : ""}</td>
                      <td style={s.td}>{m.lugares_da_mesa}</td>
                      <td style={s.td}><input type="checkbox" checked={m.disponivel_site} onChange={(e) => mudarMesa(m.mesa_id, { disponivel_site: e.target.checked })} /></td>
                      <td style={s.td}><input type="checkbox" checked={m.disponivel_whatsapp} onChange={(e) => mudarMesa(m.mesa_id, { disponivel_whatsapp: e.target.checked })} /></td>
                      <td style={s.td}><input type="checkbox" checked={m.disponivel_admin} onChange={(e) => mudarMesa(m.mesa_id, { disponivel_admin: e.target.checked })} /></td>
                      <td style={s.td}>
                        <input
                          style={{ ...s.inputCelula, width: 70 }}
                          inputMode="numeric"
                          value={m.lugares_ajuste ?? ""}
                          placeholder="—"
                          onChange={(e) => mudarMesa(m.mesa_id, { lugares_ajuste: e.target.value.trim() === "" ? null : Number(e.target.value) })}
                        />
                      </td>
                      <td style={s.td}>
                        {m.segurada ? <span style={selo("alerta")}>reservada</span> : indisponivel ? <span style={selo("neutro")}>indisponível</span> : "livre"}{" "}
                        <button type="button" style={s.botaoMiniOutline} onClick={() => mudarMesa(m.mesa_id, { disponivel_site: false, disponivel_whatsapp: false, disponivel_admin: false })}>
                          Indisponível
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {mesas.length === 0 && <tr><td style={s.td} colSpan={7}>Nenhuma mesa cadastrada. Cadastre no mapa de mesas.</td></tr>}
              </tbody>
            </table>
          </div>

          </section>

          <div className="qh-salvar">
            <button type="submit" style={{ ...s.botaoSalvar, marginTop: 0 }} disabled={salvando || copiando}>
              {salvando ? "Salvando…" : "Salvar regras e canais"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
