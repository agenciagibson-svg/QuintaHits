"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatData, hojeISO, type Edicao } from "@/lib/edicao";
import { ehTravada, formatarWhatsapp, type Mesa, type Reserva, type StatusReserva } from "@/lib/reserva";
import { cor, s, selo, type Tom } from "./estilos";
import type { PedidoPendente } from "./AdminDashboard";
import MapaMesas, { LegendaMapa, type EstadoMesa } from "@/components/MapaMesas";
import type { ElementoSalao } from "@/lib/planta";
import { linkWhatsappCliente } from "@/lib/mensagemCliente";
import { CASAS, CASA_PADRAO, dataDaEdicaoId, type CasaId } from "@/config/casas";

const ROTULO_STATUS: Record<StatusReserva, string> = {
  aguardando: "Para confirmar",
  confirmada: "Confirmada",
  expirada: "Expirada",
  cancelada: "Cancelada",
  nao_compareceu: "Não compareceu",
};

const TOM_STATUS: Record<StatusReserva, Tom> = {
  aguardando: "alerta",
  confirmada: "ok",
  expirada: "neutro",
  cancelada: "neutro",
  nao_compareceu: "perigo",
};

/** Próxima edição (de hoje em diante); se não houver, a mais recente. `edicoes` vem em ordem decrescente de data. */
function edicaoPadrao(edicoes: Edicao[]): string {
  const hoje = hojeISO();
  const futuras = edicoes.filter((e) => e.data >= hoje && e.status !== "cancelada");
  return (futuras[futuras.length - 1] ?? edicoes[0])?.id ?? "";
}

const botaoWhats: React.CSSProperties = { ...s.botaoMini, background: "#1f7a4d", borderColor: "#1f7a4d", textDecoration: "none", display: "inline-block" };

export default function ReservasPainel({ edicoes, pendentes = [], onMudou, casa = CASA_PADRAO }: { edicoes: Edicao[]; pendentes?: PedidoPendente[]; onMudou?: () => void; casa?: CasaId }) {
  const plantaDaCasa = CASAS[casa].mapa;
  const mapaLargo = plantaDaCasa.tamanhoMesa !== null;
  const router = useRouter();
  const [edicaoId, setEdicaoId] = useState(() => edicaoPadrao(edicoes));
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [planta, setPlanta] = useState<ElementoSalao[]>([]);
  const [erro, setErro] = useState("");
  // Mesa clicada no mapa: abre o quadro para reservar para um cliente, travar, destravar ou responder o pedido.
  const [mesaSel, setMesaSel] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", whatsapp: "", pessoas: "", motivo: "" });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const quadroMesa = useRef<HTMLElement | null>(null);
  // O mapa é grande: ao tocar numa mesa, traz o quadro dela para a tela.
  useEffect(() => {
    if (mesaSel) quadroMesa.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [mesaSel]);

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
      const [resR, resM] = await Promise.all([fetch(`/api/admin/reservas?edicao=${encodeURIComponent(id)}`), fetch(`/api/admin/mesas?casa=${casa}`)]);
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
    fetch(`/api/admin/planta?casa=${casa}`).then((r) => (r.ok ? r.json() : null)).then((p) => p && setPlanta(p.elementos ?? [])).catch(() => undefined);
  }, [casa]);

  useEffect(() => {
    setMesaSel(null);
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

  function escolherMesa(id: string) {
    setMesaSel((atual) => (atual === id ? null : id));
    setForm({ nome: "", whatsapp: "", pessoas: "", motivo: "" });
    setMsg("");
    setErro("");
  }

  /** Reserva de cliente (já confirmada) ou mesa travada, feita pela equipe no mapa. */
  async function ocupar(travar: boolean) {
    if (!mesaSel || salvando) return;
    setSalvando(true);
    setErro("");
    setMsg("");
    try {
      const corpo = travar
        ? { edicao_id: edicaoId, mesa_id: mesaSel, travar: true, motivo: form.motivo }
        : { edicao_id: edicaoId, mesa_id: mesaSel, nome: form.nome, whatsapp: form.whatsapp, pessoas: Number(form.pessoas) || 0 };
      const res = await fetch("/api/admin/reservas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      if (res.status === 401) return router.replace("/admin/login");
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setErro(j.erro || "Não foi possível salvar.");
      setMsg(travar ? `Mesa ${j.mesa ?? ""} travada nesta noite.` : `Mesa ${j.mesa ?? ""} reservada para ${form.nome.trim()} (confirmada).`);
      setForm({ nome: "", whatsapp: "", pessoas: "", motivo: "" });
      await carregar(edicaoId, true);
      onMudou?.();
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  /** Chegada na porta marcada pelo painel (mesmo registro do QR). Vale também para corrigir noites que passaram. */
  async function checkin(r: Reserva, acao: "chegou" | "desfazer" | "nao_veio") {
    const res = await fetch("/api/admin/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: r.id, acao }) });
    if (res.status === 401) return router.replace("/admin/login");
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setErro(j.erro || "Não foi possível registrar a chegada.");
    setErro("");
    await carregar(edicaoId, true);
    onMudou?.();
  }

  /** Destravar = cancelar a trava (a mesa volta a ficar livre no site). Sem confirmação: dá para travar de novo. */
  async function destravar(r: Reserva) {
    const res = await fetch(`/api/admin/reservas/${r.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelada" }) });
    if (res.status === 401) return router.replace("/admin/login");
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return setErro(j.erro || "Não foi possível destravar.");
    }
    setMsg(`Mesa ${numeroMesa(r.mesa_id)} destravada.`);
    await carregar(edicaoId, true);
    onMudou?.();
  }

  const numeroMesa = (id: string) => mesas.find((m) => m.id === id)?.numero ?? "?";
  const edicao = edicoes.find((e) => e.id === edicaoId);

  /** Abre o WhatsApp normal da casa com a mensagem pronta para o cliente (não depende da Meta). */
  const linkWhatsapp = (r: Reserva) => linkWhatsappCliente(r, edicao, numeroMesa(r.mesa_id));

  /** No mapa do painel: confirmada = vermelho (reservada), pedido esperando a equipe = amarelo, travada = preto. */
  function estadoNoMapa(mesaId: string): EstadoMesa {
    const m = mesas.find((x) => x.id === mesaId);
    if (m && !m.ativa) return "inativa";
    const doMesa = reservas.filter((r) => r.mesa_id === mesaId);
    const confirmada = doMesa.find((r) => r.status === "confirmada");
    if (confirmada) return ehTravada(confirmada) ? "travada" : "ocupada";
    if (doMesa.some((r) => r.status === "aguardando")) return "pendente";
    return mesaId === mesaSel ? "selecionada" : "livre";
  }
  const clienteDaMesa = (mesaId: string) => reservas.find((r) => r.mesa_id === mesaId && (r.status === "confirmada" || r.status === "aguardando"));

  const travadas = reservas.filter((r) => r.status === "confirmada" && ehTravada(r));
  const ativas = reservas.filter((r) => (r.status === "aguardando" || r.status === "confirmada") && !ehTravada(r));
  const aguardando = reservas.filter((r) => r.status === "aguardando").length;
  const pessoasConfirmadas = reservas.filter((r) => r.status === "confirmada" && !ehTravada(r)).reduce((t, r) => t + r.pessoas, 0);
  const podeOcupar = !!edicao && edicao.data >= hojeISO() && edicao.status !== "cancelada";
  // Comparecimento: das reservas confirmadas de clientes (e das que não vieram), quantas fizeram check-in.
  const confirmadasCliente = reservas.filter((r) => r.status === "confirmada" && !ehTravada(r));
  const chegaram = confirmadasCliente.filter((r) => r.chegou_em);
  const naoVieram = reservas.filter((r) => r.status === "nao_compareceu");
  const baseComparecimento = confirmadasCliente.length + naoVieram.length;
  const noitePassouOuHoje = !!edicao && edicao.data <= hojeISO();
  const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const mesaEscolhida = mesas.find((m) => m.id === mesaSel);
  const reservaDaEscolhida = mesaSel ? clienteDaMesa(mesaSel) : undefined;

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
            {n} para confirmar em {formatData(dataDaEdicaoId(id), "numerica")}
          </button>
        ))}
      </div>

      {erro && <div style={{ ...s.avisoErro, marginTop: 12 }}>{erro}</div>}

      <div className="qh-kpis qh-compacto" style={{ marginTop: 16 }}>
        <div className="qh-kpi"><span className="qh-kpi-rotulo">Para confirmar</span><span className="qh-kpi-valor" style={aguardando ? { color: cor.mostarda } : undefined}>{aguardando}</span></div>
        <div className="qh-kpi"><span className="qh-kpi-rotulo">Mesas ocupadas</span><span className="qh-kpi-valor">{ativas.length}</span></div>
        <div className="qh-kpi"><span className="qh-kpi-rotulo">Pessoas confirmadas</span><span className="qh-kpi-valor">{pessoasConfirmadas}</span></div>
        <div className="qh-kpi"><span className="qh-kpi-rotulo">Mesas travadas</span><span className="qh-kpi-valor">{travadas.length}</span></div>
        {noitePassouOuHoje && baseComparecimento > 0 && (
          <div className="qh-kpi">
            <span className="qh-kpi-rotulo">Chegaram (check-in)</span>
            <span className="qh-kpi-valor">
              {chegaram.length}/{baseComparecimento}
              <small style={{ fontSize: 14, marginLeft: 8, color: cor.suave }}>{Math.round((chegaram.length / baseComparecimento) * 100)}%</small>
            </span>
          </div>
        )}
      </div>
      {msg && <div style={{ ...s.aviso, marginTop: 12 }}>{msg}</div>}

      {mesas.length > 0 && (
        <section style={{ ...s.secao, background: "#f1e7d2", padding: 16, maxWidth: mapaLargo ? undefined : 780 }}>
          <MapaMesas
            mesas={mesas.map((m) => {
              const c = clienteDaMesa(m.id);
              return { ...m, area: c ? (ehTravada(c) ? `Travada${c.observacoes ? ` · ${c.observacoes}` : ""}` : `${c.nome} · ${c.pessoas} pessoa(s)`) : m.area };
            })}
            elementos={planta}
            planta={plantaDaCasa}
            desativarOcupadas={false}
            estado={(m) => estadoNoMapa(m.id)}
            onEscolher={(m) => escolherMesa(m.id)}
          />
          <div style={{ color: "#171717" }}><LegendaMapa painel destaque={plantaDaCasa.destaque?.rotulo ?? null} /></div>
          {!mesaSel && <p style={{ margin: "10px 0 0", fontSize: 13, color: "#171717", opacity: 0.7 }}>Toque numa mesa para reservar para um cliente ou travar.</p>}
        </section>
      )}

      {mesaEscolhida && (
        <section ref={quadroMesa} style={{ ...s.secao, borderColor: cor.mostarda }} aria-live="polite">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              Mesa {mesaEscolhida.numero}
              <span style={{ fontSize: 13, fontWeight: 400, color: cor.suave }}> · {mesaEscolhida.lugares} lugares{mesaEscolhida.area ? ` · ${mesaEscolhida.area}` : ""}</span>
            </div>
            <button type="button" style={s.botaoMiniOutline} onClick={() => setMesaSel(null)}>Fechar</button>
          </div>

          {!mesaEscolhida.ativa ? (
            <p style={s.legenda}>Mesa desativada no cadastro (aba Mesas).</p>
          ) : reservaDaEscolhida && ehTravada(reservaDaEscolhida) ? (
            <>
              <p style={{ margin: "0 0 12px" }}>
                <span style={selo("neutro")}>Travada</span>
                {reservaDaEscolhida.observacoes ? <span style={{ marginLeft: 8, color: cor.suave }}>{reservaDaEscolhida.observacoes}</span> : null}
              </p>
              <button type="button" style={s.botaoMini} onClick={() => destravar(reservaDaEscolhida)}>Destravar mesa</button>
            </>
          ) : reservaDaEscolhida ? (
            <>
              <p style={{ margin: "0 0 12px" }}>
                <strong>{reservaDaEscolhida.nome}</strong> · {reservaDaEscolhida.pessoas} pessoa(s) · {formatarWhatsapp(reservaDaEscolhida.whatsapp)}{" "}
                <span style={selo(TOM_STATUS[reservaDaEscolhida.status])}>{ROTULO_STATUS[reservaDaEscolhida.status]}</span>
              </p>
              {reservaDaEscolhida.status === "aguardando" ? (
                <>
                  <button style={s.botaoMini} onClick={() => mudarStatus(reservaDaEscolhida, "confirmada")}>Confirmar</button>
                  <button style={s.botaoMiniPerigo} onClick={() => mudarStatus(reservaDaEscolhida, "cancelada")}>Recusar</button>
                </>
              ) : (
                <>
                  <a style={botaoWhats} href={linkWhatsapp(reservaDaEscolhida)} target="_blank" rel="noopener noreferrer">Avisar no WhatsApp</a>
                  <button style={s.botaoMiniPerigo} onClick={() => mudarStatus(reservaDaEscolhida, "cancelada")}>Cancelar reserva</button>
                </>
              )}
            </>
          ) : !podeOcupar ? (
            <p style={s.legenda}>Essa noite já passou ou foi cancelada: não dá para reservar nem travar.</p>
          ) : (
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ocupar(false);
                }}
                style={{ display: "grid", gap: 10 }}
              >
                <div style={{ fontWeight: 600 }}>Reservar para um cliente</div>
                <label style={s.campo}><span>Nome</span><input style={s.input} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} maxLength={80} required /></label>
                <label style={s.campo}><span>WhatsApp (com DDD)</span><input style={s.input} inputMode="tel" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="(34) 99999-9999" required /></label>
                <label style={s.campo}><span>Pessoas</span><input style={s.input} inputMode="numeric" value={form.pessoas} onChange={(e) => setForm({ ...form, pessoas: e.target.value.replace(/\D/g, "") })} placeholder={`até ${mesaEscolhida.lugares}`} required /></label>
                <div><button type="submit" style={s.botaoMini} disabled={salvando}>{salvando ? "Salvando…" : "Reservar (já confirmada)"}</button></div>
              </form>
              <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
                <div style={{ fontWeight: 600 }}>Travar a mesa nesta noite</div>
                <div style={{ fontSize: 13, color: cor.suave }}>Ninguém consegue reservar: no site ela aparece como reservada. Dá para destravar depois.</div>
                <label style={s.campo}><span>Motivo (opcional, só a equipe vê)</span><input style={s.input} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} maxLength={200} placeholder="Ex.: mesa do dono, convidados do artista" /></label>
                <div><button type="button" style={s.botaoMiniOutline} disabled={salvando} onClick={() => ocupar(true)}>Travar mesa</button></div>
              </div>
            </div>
          )}
        </section>
      )}

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
              {reservas.map((r) => ehTravada(r) ? (
                <tr key={r.id} style={{ opacity: r.status === "cancelada" ? 0.5 : 1 }}>
                  <td style={{ ...s.td, fontFamily: "var(--display, Impact, sans-serif)", fontSize: 24 }}>{numeroMesa(r.mesa_id)}</td>
                  <td style={s.td}>
                    <div style={{ fontWeight: 600 }}>Mesa travada</div>
                    {r.observacoes ? <div style={{ fontSize: 12, color: cor.suave }}>{r.observacoes}</div> : null}
                  </td>
                  <td style={s.td}>—</td>
                  <td style={{ ...s.td, whiteSpace: "nowrap", color: cor.suave }}>
                    {new Date(r.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td style={s.td}><span style={selo("neutro")}>{r.status === "confirmada" ? "Travada" : "Destravada"}</span></td>
                  <td style={{ ...s.td, whiteSpace: "nowrap", textAlign: "right" }}>
                    {r.status === "confirmada" && <button style={{ ...s.botaoMiniOutline, marginRight: 0 }} onClick={() => destravar(r)}>Destravar</button>}
                  </td>
                </tr>
              ) : (
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
                  <td style={s.td}>
                    <span style={selo(TOM_STATUS[r.status])}>{ROTULO_STATUS[r.status]}</span>
                    {r.status === "confirmada" && r.chegou_em && <span style={{ ...selo("ok"), marginLeft: 6 }}>Chegou {horaDe(r.chegou_em)}</span>}
                  </td>
                  <td style={{ ...s.td, whiteSpace: "nowrap", textAlign: "right" }}>
                    {noitePassouOuHoje && (r.status === "confirmada" || r.status === "nao_compareceu") && !r.chegou_em && (
                      <button style={s.botaoMini} onClick={() => checkin(r, "chegou")}>Chegou</button>
                    )}
                    {noitePassouOuHoje && r.status === "confirmada" && r.chegou_em && (
                      <button style={s.botaoMiniOutline} onClick={() => checkin(r, "desfazer")}>Desfazer chegada</button>
                    )}
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
        Toque numa mesa do mapa para reservar para um cliente (telefone, balcão, Instagram) ou travar a mesa na noite.
        Depois de confirmar, use <strong>Avisar no WhatsApp</strong>: abre o WhatsApp da casa com a mensagem pronta para o cliente.
        Pedido sem resposta expira sozinho no fim do dia da edição.
      </p>
    </>
  );
}
