"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatData, hojeISO, type Edicao } from "@/lib/edicao";
import { formatarWhatsapp, type Mesa, type Reserva, type StatusReserva } from "@/lib/reserva";
import { cor, s, selo, type Tom } from "./estilos";

const ROTULO_STATUS: Record<StatusReserva, string> = {
  aguardando: "aguardando WhatsApp",
  confirmada: "confirmada",
  expirada: "expirada",
  cancelada: "cancelada",
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

export default function ReservasPainel({ edicoes }: { edicoes: Edicao[] }) {
  const router = useRouter();
  const [edicaoId, setEdicaoId] = useState(() => edicaoPadrao(edicoes));
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  // Troca rápida de edição: só a resposta da última escolhida preenche a tabela
  // (senão a mensagem de WhatsApp sairia com a data de outra edição).
  const ultimoPedido = useRef("");

  async function carregar(id: string) {
    if (!id) return;
    ultimoPedido.current = id;
    setCarregando(true);
    setErro("");
    setReservas([]);
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

  async function mudarStatus(r: Reserva, status: "confirmada" | "cancelada") {
    const mesa = numeroMesa(r.mesa_id);
    if (status === "cancelada" && !confirm(`Cancelar a reserva de ${r.nome} (mesa ${mesa})? A mesa volta a ficar livre no site.`)) return;
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
  }

  const numeroMesa = (id: string) => mesas.find((m) => m.id === id)?.numero ?? "?";
  const edicao = edicoes.find((e) => e.id === edicaoId);

  function linkWhatsapp(r: Reserva): string {
    const data = edicao ? formatData(edicao.data, "numerica") : "";
    const texto =
      r.status === "confirmada"
        ? `Olá, ${r.nome}! Sua mesa ${numeroMesa(r.mesa_id)} na QUINTA HITS de ${data} está confirmada. Te esperamos!`
        : `Olá, ${r.nome}! Sobre seu pedido da mesa ${numeroMesa(r.mesa_id)} na QUINTA HITS de ${data}:`;
    return `https://wa.me/55${r.whatsapp}?text=${encodeURIComponent(texto)}`;
  }

  const ativas = reservas.filter((r) => r.status === "aguardando" || r.status === "confirmada");
  const aguardando = reservas.filter((r) => r.status === "aguardando").length;
  const pessoasConfirmadas = reservas.filter((r) => r.status === "confirmada").reduce((t, r) => t + r.pessoas, 0);

  return (
    <>
      <label style={{ ...s.campo, maxWidth: 360 }}>
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

      {erro && <div style={{ ...s.avisoErro, marginTop: 12 }}>{erro}</div>}

      <div className="qh-kpis qh-compacto" style={{ marginTop: 16 }}>
        <div className="qh-kpi"><span className="qh-kpi-rotulo">Mesas ocupadas</span><span className="qh-kpi-valor">{ativas.length}</span></div>
        <div className="qh-kpi"><span className="qh-kpi-rotulo">Aguardando WhatsApp</span><span className="qh-kpi-valor" style={aguardando ? { color: cor.mostarda } : undefined}>{aguardando}</span></div>
        <div className="qh-kpi"><span className="qh-kpi-rotulo">Pessoas confirmadas</span><span className="qh-kpi-valor">{pessoasConfirmadas}</span></div>
      </div>

      {carregando ? (
        <p style={s.legenda}>Carregando…</p>
      ) : reservas.length === 0 ? (
        <div style={{ ...s.secao, textAlign: "center", padding: "40px 22px" }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Nenhum pedido para esta noite</div>
          <div style={{ fontSize: 13, color: cor.suave }}>Os pedidos feitos pelo site e pelo WhatsApp aparecem aqui na hora.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto", background: cor.cartao, border: `1px solid ${cor.linha}`, borderRadius: 14 }}>
          <table style={s.tabela} className="qh-tabela">
            <thead>
              <tr>
                {["Mesa", "Nome", "WhatsApp", "Pessoas", "Código", "Pedido em", "Status", ""].map((c) => (
                  <th key={c} style={s.th}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reservas.map((r) => (
                <tr key={r.id} style={{ opacity: r.status === "expirada" || r.status === "cancelada" ? 0.55 : 1 }}>
                  <td style={s.td}><strong>{numeroMesa(r.mesa_id)}</strong></td>
                  <td style={s.td}>{r.nome}</td>
                  <td style={s.td}>
                    <a href={linkWhatsapp(r)} target="_blank" rel="noopener noreferrer" style={{ color: cor.mostarda }}>
                      {formatarWhatsapp(r.whatsapp)}
                    </a>
                  </td>
                  <td style={s.td}>{r.pessoas}</td>
                  <td style={s.td}>{r.codigo ?? "—"}</td>
                  <td style={s.td}>
                    {new Date(r.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td style={s.td}>
                    <span style={selo(TOM_STATUS[r.status])}>{ROTULO_STATUS[r.status]}</span>
                  </td>
                  <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                    {/* Confirmar à mão: cliente que não conseguiu mandar o código (ou pedido que expirou). */}
                    {(r.status === "aguardando" || r.status === "expirada") && (
                      <button style={s.botaoMini} onClick={() => mudarStatus(r, "confirmada")}>Confirmar</button>
                    )}
                    {r.status === "aguardando" && (
                      <button style={s.botaoMiniPerigo} onClick={() => mudarStatus(r, "cancelada")}>Cancelar</button>
                    )}
                    {r.status === "confirmada" && (
                      <button style={s.botaoMiniPerigo} onClick={() => mudarStatus(r, "cancelada")}>Cancelar</button>
                    )}
                    {r.status === "cancelada" && (
                      <button style={s.botaoMiniOutline} onClick={() => mudarStatus(r, "confirmada")}>Reabrir</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
