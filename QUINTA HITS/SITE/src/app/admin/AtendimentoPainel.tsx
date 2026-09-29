"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FiltroAtendimento, ItemAtendimento, MensagemDoHistorico, NotaInterna } from "@/lib/agente/atendimento";
import { cor, s, selo } from "./estilos";

const ROTULO_MOTIVO: Record<string, string> = {
  pedido_do_cliente: "O cliente pediu uma pessoa",
  reclamacao: "Reclamação",
  disponibilidade_indefinida: "Disponibilidade indefinida",
  edicao_nao_pronta: "Edição ainda não pronta para reservas automáticas",
  nao_entendeu: "O agente não entendeu o cliente",
  fora_do_fluxo: "Assunto fora do fluxo",
  erro_tecnico: "Erro técnico",
  excecao_de_reserva: "Exceção de reserva (mesa, pessoas, data ou prazo)",
  pagamento_ou_estorno: "Pagamento, sinal ou estorno",
  numero_nao_brasileiro: "Número que não é celular brasileiro",
  outro: "Outro motivo",
};

const ROTULO_FILTRO: Record<FiltroAtendimento, string> = {
  abertas: "Em aberto (aguardando + com a equipe)",
  aguardando: "Aguardando atendimento",
  assumida: "Com a equipe",
  devolvida: "Devolvidas ao agente",
  encerrada: "Encerradas",
  todas: "Todas",
};

const INTERVALO_MS = 15_000;

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const dataBR = (iso: string) => iso.split("-").reverse().join("/");

/** Fila de atendimento humano. `onContagem` avisa o painel quantos estão aguardando (contador no topo). */
export default function AtendimentoPainel({ onContagem }: { onContagem?: (n: number) => void }) {
  const router = useRouter();
  const [migrado, setMigrado] = useState(true);
  const [filtro, setFiltro] = useState<FiltroAtendimento>("abertas");
  const [itens, setItens] = useState<ItemAtendimento[]>([]);
  const [pendentes, setPendentes] = useState(0);
  const [naoLidas, setNaoLidas] = useState(0);
  const [envioReal, setEnvioReal] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [historico, setHistorico] = useState<MensagemDoHistorico[]>([]);
  const [notas, setNotas] = useState<NotaInterna[] | null>([]);
  const [texto, setTexto] = useState("");
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [pausa, setPausa] = useState<boolean | null>(null);
  const abertoRef = useRef<string | null>(null);
  const filtroRef = useRef<FiltroAtendimento>("abertas");

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/whatsapp/atendimento?status=${filtroRef.current}`);
      if (res.status === 401) return router.replace("/admin/login");
      if (!res.ok) throw new Error();
      const j = await res.json();
      setMigrado(j.migrado !== false);
      setItens(j.itens ?? []);
      setPendentes(j.pendentes ?? 0);
      setNaoLidas(j.nao_lidas ?? 0);
      setEnvioReal(!!j.envio_real);
      onContagem?.(j.pendentes ?? 0);
      setErro("");
      const rc = await fetch("/api/admin/whatsapp/config");
      if (rc.ok) { const c = await rc.json(); setPausa(c.migrado ? !!c.config?.pausa_emergencia : null); }
    } catch {
      setErro("Não foi possível carregar a fila de atendimento.");
    }
  }, [router, onContagem]);

  const carregarDetalhe = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/whatsapp/atendimento/${id}`);
    if (res.ok && abertoRef.current === id) {
      const j = await res.json();
      setHistorico(j.mensagens ?? []);
      setNotas(j.notas ?? null);
    }
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(() => { carregar(); if (abertoRef.current) carregarDetalhe(abertoRef.current); }, INTERVALO_MS);
    return () => clearInterval(t);
  }, [carregar, carregarDetalhe]);

  async function chamar(id: string, corpo: Record<string, unknown>) {
    const res = await fetch(`/api/admin/whatsapp/atendimento/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401) { router.replace("/admin/login"); return null; }
    if (!res.ok) { setErro(j.erro || "Não foi possível concluir a ação."); return null; }
    return j as Record<string, unknown>;
  }

  function abrir(id: string) {
    setAberto(id);
    abertoRef.current = id;
    setHistorico([]);
    setNotas([]);
    carregarDetalhe(id);
    // Abrir o atendimento = a equipe viu as mensagens do cliente.
    chamar(id, { acao: "marcar_lida" }).then(() => carregar());
  }

  function mudarFiltro(novo: FiltroAtendimento) {
    setFiltro(novo);
    filtroRef.current = novo;
    setAberto(null);
    abertoRef.current = null;
    carregar();
  }

  async function acao(id: string, qual: "assumir" | "devolver" | "encerrar" | "enviar") {
    setErro("");
    const j = await chamar(id, { acao: qual, ...(qual === "enviar" ? { texto } : {}) });
    if (!j) return;
    if (qual === "enviar") { setTexto(""); setMsg(j.simulado ? "SIMULADO: a mensagem ficou na fila e NÃO foi enviada (envio real desligado)." : "Mensagem na fila de envio."); }
    if (qual === "devolver" || qual === "encerrar") { setAberto(null); abertoRef.current = null; setMsg(qual === "devolver" ? "Conversa devolvida ao agente." : "Atendimento encerrado."); }
    setTimeout(() => setMsg(""), 4000);
    await carregar();
    if (abertoRef.current) carregarDetalhe(abertoRef.current);
  }

  async function salvarNota(id: string) {
    setErro("");
    if (!(await chamar(id, { acao: "nota", texto: nota }))) return;
    setNota("");
    carregarDetalhe(id);
  }

  async function alternarPausa() {
    const nova = !pausa;
    if (!confirm(nova ? "Ativar a PAUSA DE EMERGÊNCIA? O agente e todo envio param imediatamente." : "Desativar a pausa de emergência?")) return;
    const res = await fetch("/api/admin/whatsapp/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pausa_emergencia: nova }) });
    if (res.ok) setPausa(nova); else setErro((await res.json().catch(() => ({}))).erro || "Não foi possível alterar a pausa.");
  }

  if (!migrado) {
    return <p style={s.legenda}>O atendimento humano ainda não está ativo neste banco: a migração do agente de reservas não foi aplicada. Nada aqui altera as reservas do site.</p>;
  }

  const selecionado = itens.find((i) => i.transferencia_id === aberto) ?? null;
  const destaque = pendentes > 0;
  const emAberto = selecionado && (selecionado.status === "aguardando" || selecionado.status === "assumida");

  return (
    <div>
      {!envioReal && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: cor.suave, marginBottom: 14 }} role="note">
          <span style={selo("alerta")}>Modo simulado</span>
          <span>O WhatsApp ainda não está conectado: respostas escritas aqui ficam na fila e não saem para o cliente.</span>
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <span role="status" style={{ ...selo(destaque ? "perigo" : "ok"), fontSize: 13, padding: "5px 14px" }}>
          {destaque ? `${pendentes} aguardando atendimento humano` : "Nenhum cliente aguardando"}
        </span>
        {naoLidas > 0 && <span style={{ ...selo("alerta"), fontSize: 13, padding: "5px 14px" }}>{naoLidas} mensagem(ns) não lida(s)</span>}
        <label style={{ ...s.campo, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <span>Filtro:</span>
          <select style={s.input} value={filtro} onChange={(e) => mudarFiltro(e.target.value as FiltroAtendimento)}>
            {(Object.keys(ROTULO_FILTRO) as FiltroAtendimento[]).map((f) => <option key={f} value={f}>{ROTULO_FILTRO[f]}</option>)}
          </select>
        </label>
        {pausa !== null && (
          <button type="button" style={pausa ? s.botaoMini : s.botaoMiniPerigo} onClick={alternarPausa}>
            {pausa ? "Pausa de emergência ATIVA — desativar" : "Pausa de emergência"}
          </button>
        )}
      </div>
      {erro && <div style={{ ...s.avisoErro, marginInline: 0 }}>{erro}</div>}
      {msg && <div style={{ ...s.aviso, marginInline: 0 }}>{msg}</div>}

      {itens.length === 0 ? (
        <div style={{ ...s.secao, textAlign: "center", padding: "40px 22px" }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Nenhuma conversa aqui</div>
          <div style={{ fontSize: 13, color: cor.suave }}>Quando o agente passar uma conversa para a equipe, ela aparece nesta lista.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto", background: cor.cartao, border: `1px solid ${cor.linha}`, borderRadius: 14 }}>
          <table style={s.tabela} className="qh-tabela">
            <thead>
              <tr><th style={s.th}>Cliente</th><th style={s.th}>Motivo</th><th style={s.th}>Edição / reserva</th><th style={s.th}>Última mensagem</th><th style={s.th}>Desde</th><th style={s.th}>Situação</th><th style={s.th} /></tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.transferencia_id} style={i.status === "aguardando" ? { background: "rgba(184,74,50,0.08)" } : undefined}>
                  <td style={s.td}>{i.contato.nome || "sem nome"}<br /><small>{i.contato.telefone}</small></td>
                  <td style={s.td}>{ROTULO_MOTIVO[i.motivo] ?? i.motivo}</td>
                  <td style={s.td}>
                    {i.edicao ? `${dataBR(i.edicao.data)} — ${i.edicao.artista || "sem atração"}` : "—"}
                    {i.reserva && <><br /><small>{i.reserva.codigo} · mesa {i.reserva.mesa} · {i.reserva.status}</small></>}
                  </td>
                  <td style={s.td}>
                    {i.nao_lidas > 0 && <span style={{ ...s.selo, background: "#D5A62A", color: "#171717", marginRight: 6 }} title="Mensagens do cliente ainda não vistas">{i.nao_lidas} nova(s)</span>}
                    {i.ultima_mensagem || "—"}
                  </td>
                  <td style={s.td}>{quando(i.criada_em)}</td>
                  <td style={s.td}>
                    {i.status === "aguardando" ? <span style={selo("perigo")}>aguardando</span>
                      : i.status === "assumida" ? <span style={selo("ok")}>com {i.atendente}</span>
                      : <span style={selo("neutro")}>{i.status}</span>}
                  </td>
                  <td style={{ ...s.td, whiteSpace: "nowrap" }}><button type="button" style={s.botaoMiniOutline} onClick={() => abrir(i.transferencia_id)}>Abrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selecionado && (
        <div style={{ ...s.secao, marginTop: 16, maxWidth: 820 }}>
          <strong>{selecionado.contato.nome || "Cliente"}</strong> · {selecionado.contato.telefone}
          <p style={s.legenda}>
            Motivo: {ROTULO_MOTIVO[selecionado.motivo] ?? selecionado.motivo}{selecionado.detalhe ? ` — ${selecionado.detalhe}` : ""}
            {selecionado.edicao ? ` · Edição: ${dataBR(selecionado.edicao.data)}` : ""}
            {selecionado.reserva ? ` · Reserva ${selecionado.reserva.codigo} (mesa ${selecionado.reserva.mesa}, ${selecionado.reserva.status})` : ""}
          </p>
          <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {historico.map((m) => (
              <div key={m.id} style={{ alignSelf: m.direcao === "entrada" ? "flex-start" : "flex-end", maxWidth: "85%", background: m.direcao === "entrada" ? "#2a2a2a" : m.autor === "atendente" ? "#17352B" : "#3a3320", borderRadius: 8, padding: "6px 10px", fontSize: 13, whiteSpace: "pre-wrap" }}>
                <small style={{ opacity: 0.7 }}>{m.autor} · {quando(m.criada_em)}{m.status === "falhou" ? " · falhou" : m.status === "na_fila" ? (envioReal ? " · na fila" : " · simulada (não enviada)") : ""}</small>
                <div>{m.conteudo || "(conteúdo removido pela política de retenção)"}</div>
              </div>
            ))}
          </div>

          {selecionado.status === "aguardando" && (
            <button type="button" style={s.botaoMini} onClick={() => acao(selecionado.transferencia_id, "assumir")}>Assumir atendimento</button>
          )}
          {selecionado.status === "assumida" && (
            <>
              <textarea style={{ ...s.input, width: "100%", minHeight: 60 }} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva a resposta ao cliente" />
              <p style={s.legenda}>{envioReal ? "A resposta vai pela fila de envio (respeita a janela de 24 h e os interruptores)." : "Modo simulado: a resposta fica na fila e não é enviada."}</p>
              <button type="button" style={s.botaoMini} disabled={!texto.trim()} onClick={() => acao(selecionado.transferencia_id, "enviar")}>{envioReal ? "Enviar" : "Enviar (simulado)"}</button>
              <button type="button" style={s.botaoMiniOutline} onClick={() => acao(selecionado.transferencia_id, "devolver")}>Devolver ao agente</button>
              <button type="button" style={s.botaoMiniPerigo} onClick={() => acao(selecionado.transferencia_id, "encerrar")}>Encerrar</button>
            </>
          )}
          {selecionado.status === "aguardando" && (
            <>
              <button type="button" style={s.botaoMiniOutline} onClick={() => acao(selecionado.transferencia_id, "devolver")}>Devolver ao agente</button>
              <button type="button" style={s.botaoMiniPerigo} onClick={() => acao(selecionado.transferencia_id, "encerrar")}>Encerrar</button>
            </>
          )}

          <div style={{ marginTop: 16, borderTop: "1px solid #333", paddingTop: 12 }}>
            <strong style={{ fontSize: 13 }}>Notas internas</strong> <small style={{ opacity: 0.7 }}>(só a equipe vê; nunca vão para o cliente)</small>
            {notas === null ? (
              <p style={s.legenda}>As notas dependem da migração parte 2, ainda não aplicada neste banco.</p>
            ) : (
              <>
                {notas.length === 0 && <p style={s.legenda}>Nenhuma nota.</p>}
                {notas.map((n) => (
                  <div key={n.id} style={{ background: "#2a2515", borderRadius: 6, padding: "6px 10px", marginTop: 6, fontSize: 13, whiteSpace: "pre-wrap" }}>
                    <small style={{ opacity: 0.7 }}>{n.autor} · {quando(n.criada_em)}</small>
                    <div>{n.texto}</div>
                  </div>
                ))}
                {emAberto && (
                  <div style={{ marginTop: 8 }}>
                    <textarea style={{ ...s.input, width: "100%", minHeight: 44 }} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Escreva uma nota interna" maxLength={1000} />
                    <button type="button" style={s.botaoMiniOutline} disabled={!nota.trim()} onClick={() => salvarNota(selecionado.transferencia_id)}>Salvar nota</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
