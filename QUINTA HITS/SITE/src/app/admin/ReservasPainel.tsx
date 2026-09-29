"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatData, hojeISO, type Edicao } from "@/lib/edicao";
import { formatarWhatsapp, type Mesa, type Reserva, type StatusReserva } from "@/lib/reserva";
import { cor, s, selo, type Tom } from "./estilos";
import type { PedidoPendente } from "./AdminDashboard";

const ROTULO_STATUS: Record<StatusReserva, string> = {
  aguardando: "Para confirmar",
  confirmada: "Confirmada",
  expirada: "Expirada",
  cancelada: "Cancelada",
};

const TOM_STATUS: Record<StatusReserva, Tom> = {
  aguardando: "alerta",
  confirmada: "ok",
  expirada: "neutro",
  cancelada: "neutro",
};

/** Próxima edição (de hoje em diante); se não houver, a mais recente. `edicoes` vem em ordem decrescente de data. */
function edicaoPadrao(edicoes: Edicao[]): string {
  const hoje = hojeISO();
  const futuras = edicoes.filter((e) => e.data >= hoje && e.status !== "cancelada");
  return (futuras[futuras.length - 1] ?? edicoes[0])?.id ?? "";
}

const botaoWhats: React.CSSProperties = { ...s.botaoMini, background: "#1f7a4d", borderColor: "#1f7a4d", textDecoration: "none", display: "inline-block" };

export default function ReservasPainel({ edicoes, pendentes = [], onMudou }: { edicoes: Edicao[]; pendentes?: PedidoPendente[]; onMudou?: () => void }) {
  const router = useRouter();
  const [edicaoId, setEdicaoId] = useState(() => edicaoPadrao(edicoes));
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  // Troca rápida de edição: só a resposta da última escolhida preenche a tabela
  // (senão a mensagem de WhatsApp sairia com a data de outra edição).
  const ultimoPedido = useRef("");

  async function carregar(id: string, silencioso = false) {
    if (!id) return;
    ultimoPedido.current = id;
    if (!silencioso) {
      setCarregando(true);
      setReservas([]);
    }
    setErro("");
    try {
      const [resR, resM] = await Promise.all([fetch(`/api/admin/reservas?edicao=${id}`), fetch("/api/admin/mesas")]);
      if (resR.status === 401 || resM.status === 401) return router.replace("/admin/login");
      if (!resR.ok || !resM.ok) throw new Error();
      const [jR, jM] = await Promise.all([resR.json(), resM.json()]);
      if (ultimoPedido.current !== id) return;
      setReservas(jR.reservas ?? []);
      setMesas(jM.mesas ?? []);
    } catch {
      if (ultimoPedido.current === id) setErro("Não foi possível carregar as reservas.");
    } finally {
      if (ultimoPedido.current === id) setCarregando(false);
    }
  }

  useEffect(() => {
    carregar(edicaoId);
    // `carregar` só depende da edição escolhida; recriá-la a cada render dispararia carga em loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edicaoId]);

  // Chegou pedido novo na edição aberta (contador do painel mudou): atualiza a lista sem piscar.
  const pendentesDaEdicao = pendentes.filter((p) => p.edicao_id === edicaoId).length;
  useEffect(() => {
    if (pendentesDaEdicao > reservas.filter((r) => r.status === "aguardando").length) carregar(edicaoId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendentesDaEdicao]);

  async function mudarStatus(r: Reserva, status: "confirmada" | "cancelada") {
    const mesa = numeroMesa(r.mesa_id);
    const pergunta =
      status === "cancelada"
        ? r.status === "aguardando"
          ? `Recusar o pedido de ${r.nome} (mesa ${mesa})? A mesa volta a ficar livre no site.`
          : `Cancelar a reserva de ${r.nome} (mesa ${mesa})? A mesa volta a ficar livre no site.`
        : null;
    if (pergunta && !confirm(pergunta)) return;
    const res = await fetch(`/api/admin/reservas/${r.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.status === 401) return router.replace("/admin/login");
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErro(j.erro || "Não foi possível mudar a reserva.");
      return;
    }
    setReservas((rs) => rs.map((x) => (x.id === r.id ? { ...x, status } : x)));
    onMudou?.();
  }

  const numeroMesa = (id: string) => mesas.find((m) => m.id === id)?.numero ?? "?";
  const edicao = edicoes.find((e) => e.id === edicaoId);

  /** Abre o WhatsApp normal da casa com a mensagem pronta para o cliente (não depende da Meta). */
  function linkWhatsapp(r: Reserva): string {
    const data = edicao ? formatData(edicao.data, "numerica") : "";
    const hora = edicao?.horario ? `, a partir das ${edicao.horario}` : "";
    const local = edicao?.local ? ` no ${edicao.local}` : "";
    const texto =
      r.status === "confirmada"
        ? `Olá, ${r.nome}! Sua reserva na QUINTA HITS está confirmada: mesa ${numeroMesa(r.mesa_id)} para ${r.pessoas} pessoa(s), quinta ${data}${hora}${local}. Código ${r.codigo ?? ""}. Te esperamos!`
        : r.status === "cancelada"
          ? `Olá, ${r.nome}! Infelizmente não conseguimos confirmar a mesa ${numeroMesa(r.mesa_id)} na QUINTA HITS de ${data}. Se quiser, responda aqui que a gente te ajuda com outra opção.`
          : `Olá, ${r.nome}! Recebemos seu pedido da mesa ${numeroMesa(r.mesa_id)} na QUINTA HITS de ${data}.`;
    return `https://wa.me/55${r.whatsapp}?text=${encodeURIComponent(texto)}`;
  }

  const ativas = reservas.filter((r) => r.status === "aguardando" || r.status === "confirmada");
  const aguardando = reservas.filter((r) => r.status === "aguardando").length;
  const pessoasConfirmadas = reservas.filter((r) => r.status === "confirmada").reduce((t, r) => t + r.pessoas, 0);

  // Pedidos esperando resposta em OUTRAS edições: atalho para cada uma.
  const outras = Object.entries(
    pendentes.filter((p) => p.edicao_id !== edicaoId).reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.edicao_id]: (acc[p.edicao_id] ?? 0) + 1 }), {}),
  ).sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <label style={{ ...s.campo, maxWidth: 360, flex: "1 1 260px" }}>
          <span>Edição</span>
          <select style={s.input} value={edicaoId} onChange={(e) => setEdicaoId(e.target.value)}>
            {edicoes.map((e) => {
              const n = pendentes.filter((p) => p.edicao_id === e.id).length;
              return (
                <option key={e.id} value={e.id}>
                  {formatData(e.data, "numerica")}/{e.data.slice(0, 4)} — {e.artista || "sem artista"}
                  {e.status === "cancelada" ? " (cancelada)" : ""}
                  {n ? ` · ${n} para confirmar` : ""}
                </option>
              );
            })}
          </select>
        </label>
        {outras.map(([id, n]) => (
          <button key={id} type="button" style={{ ...s.botaoMiniOutline, borderColor: cor.mostarda, color: cor.mostarda, padding: "8px 12px" }} onClick={() => setEdicaoId(id)}>
            {n} para confirmar em {formatData(id, "numerica")}
          </button>
        ))}
      </div>

      {erro && <div style={{ ...s.avisoErro, marginTop: 12 }}>{erro}</div>}

      <div className="qh-kpis qh-compacto" style={{ marginTop: 16 }}>
        <div className="qh-kpi"><span className="qh-kpi-rotulo">Para confirmar</span><span className="qh-kpi-valor" style={aguardando ? { color: cor.mostarda } : undefined}>{aguardando}</span></div>
        <div className="qh-kpi"><span className="qh-kpi-rotulo">Mesas ocupadas</span><span className="qh-kpi-valor">{ativas.length}</span></div>
        <div className="qh-kpi"><span className="qh-kpi-rotulo">Pessoas confirmadas</span><span className="qh-kpi-valor">{pessoasConfirmadas}</span></div>
      </div>

      {carregando ? (
        <p style={s.legenda}>Carregando…</p>
      ) : reservas.length === 0 ? (
        <div style={{ ...s.secao, textAlign: "center", padding: "40px 22px" }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Nenhum pedido para esta noite</div>
          <div style={{ fontSize: 13, color: cor.suave }}>Os pedidos feitos pelo site aparecem aqui na hora.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto", background: cor.cartao, border: `1px solid ${cor.linha}`, borderRadius: 14 }}>
          <table style={s.tabela} className="qh-tabela">
            <thead>
              <tr>
                {["Mesa", "Cliente", "Pessoas", "Pedido em", "Situação", ""].map((c) => (
                  <th key={c} style={s.th}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reservas.map((r) => (
                <tr key={r.id} style={{ opacity: r.status === "expirada" ? 0.5 : 1, background: r.status === "aguardando" ? "rgba(213,166,42,0.06)" : undefined }}>
                  <td style={{ ...s.td, fontFamily: "var(--display, Impact, sans-serif)", fontSize: 24 }}>{numeroMesa(r.mesa_id)}</td>
                  <td style={s.td}>
                    <div style={{ fontWeight: 600 }}>{r.nome}</div>
                    <div style={{ fontSize: 12, color: cor.suave }}>{formatarWhatsapp(r.whatsapp)}{r.codigo ? ` · ${r.codigo}` : ""}</div>
                  </td>
                  <td style={s.td}>{r.pessoas}</td>
                  <td style={{ ...s.td, whiteSpace: "nowrap", color: cor.suave }}>
                    {new Date(r.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td style={s.td}><span style={selo(TOM_STATUS[r.status])}>{ROTULO_STATUS[r.status]}</span></td>
                  <td style={{ ...s.td, whiteSpace: "nowrap", textAlign: "right" }}>
                    {r.status === "aguardando" && (
                      <>
                        <button style={s.botaoMini} onClick={() => mudarStatus(r, "confirmada")}>Confirmar</button>
                        <button style={{ ...s.botaoMiniPerigo, marginRight: 0 }} onClick={() => mudarStatus(r, "cancelada")}>Recusar</button>
                      </>
                    )}
                    {r.status === "confirmada" && (
                      <>
                        <a style={botaoWhats} href={linkWhatsapp(r)} target="_blank" rel="noopener noreferrer">Avisar no WhatsApp</a>
                        <button style={{ ...s.botaoMiniPerigo, marginRight: 0 }} onClick={() => mudarStatus(r, "cancelada")}>Cancelar</button>
                      </>
                    )}
                    {r.status === "cancelada" && (
                      <>
                        <a style={{ ...s.botaoMiniOutline, textDecoration: "none", display: "inline-block" }} href={linkWhatsapp(r)} target="_blank" rel="noopener noreferrer">Avisar no WhatsApp</a>
                        <button style={{ ...s.botaoMiniOutline, marginRight: 0 }} onClick={() => mudarStatus(r, "confirmada")}>Reabrir</button>
                      </>
                    )}
                    {r.status === "expirada" && (
                      <button style={{ ...s.botaoMiniOutline, marginRight: 0 }} onClick={() => mudarStatus(r, "confirmada")}>Confirmar mesmo assim</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ ...s.legenda, marginTop: 12 }}>
        Depois de confirmar, use <strong>Avisar no WhatsApp</strong>: abre o WhatsApp da casa com a mensagem pronta para o cliente.
        Pedido sem resposta expira sozinho no fim do dia da edição.
      </p>
    </>
  );
}
