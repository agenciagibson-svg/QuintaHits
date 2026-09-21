"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ItemAtendimento, MensagemDoHistorico } from "@/lib/agente/atendimento";
import { s } from "./estilos";

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

const CHAVE_NOME = "qh_atendente";
const INTERVALO_MS = 15_000;

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Fila de atendimento humano. `onContagem` avisa o painel quantos estão aguardando (contador no topo). */
export default function AtendimentoPainel({ onContagem }: { onContagem?: (n: number) => void }) {
  const router = useRouter();
  const [migrado, setMigrado] = useState(true);
  const [itens, setItens] = useState<ItemAtendimento[]>([]);
  const [pendentes, setPendentes] = useState(0);
  const [aberto, setAberto] = useState<string | null>(null);
  const [historico, setHistorico] = useState<MensagemDoHistorico[]>([]);
  const [texto, setTexto] = useState("");
  const [atendente, setAtendente] = useState("");
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [pausa, setPausa] = useState<boolean | null>(null);
  const abertoRef = useRef<string | null>(null);

  useEffect(() => {
    try { setAtendente(window.localStorage.getItem(CHAVE_NOME) ?? ""); } catch { /* sem armazenamento: segue sem lembrar o nome */ }
  }, []);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/whatsapp/atendimento");
      if (res.status === 401) return router.replace("/admin/login");
      if (!res.ok) throw new Error();
      const j = await res.json();
      setMigrado(j.migrado !== false);
      setItens(j.itens ?? []);
      setPendentes(j.pendentes ?? 0);
      onContagem?.(j.pendentes ?? 0);
      setErro("");
      const rc = await fetch("/api/admin/whatsapp/config");
      if (rc.ok) { const c = await rc.json(); setPausa(c.migrado ? !!c.config?.pausa_emergencia : null); }
    } catch {
      setErro("Não foi possível carregar a fila de atendimento.");
    }
  }, [router, onContagem]);

  const carregarHistorico = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/whatsapp/atendimento/${id}`);
    if (res.ok && abertoRef.current === id) setHistorico((await res.json()).mensagens ?? []);
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(() => { carregar(); if (abertoRef.current) carregarHistorico(abertoRef.current); }, INTERVALO_MS);
    return () => clearInterval(t);
  }, [carregar, carregarHistorico]);

  function abrir(id: string) {
    setAberto(id);
    abertoRef.current = id;
    setHistorico([]);
    carregarHistorico(id);
  }

  async function acao(id: string, qual: "assumir" | "devolver" | "encerrar" | "enviar") {
    if (atendente.trim().length < 2) return setErro("Informe o seu nome antes de agir no atendimento.");
    try { window.localStorage.setItem(CHAVE_NOME, atendente.trim()); } catch { /* ignora */ }
    setErro("");
    const res = await fetch(`/api/admin/whatsapp/atendimento/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: qual, atendente: atendente.trim(), ...(qual === "enviar" ? { texto } : {}) }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401) return router.replace("/admin/login");
    if (!res.ok) return setErro(j.erro || "Não foi possível concluir a ação.");
    if (qual === "enviar") { setTexto(""); setMsg("Mensagem na fila de envio."); }
    if (qual === "devolver" || qual === "encerrar") { setAberto(null); abertoRef.current = null; setMsg(qual === "devolver" ? "Conversa devolvida ao agente." : "Atendimento encerrado."); }
    setTimeout(() => setMsg(""), 3000);
    await carregar();
    if (abertoRef.current) carregarHistorico(abertoRef.current);
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

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <span
          role="status"
          style={{ ...s.selo, background: destaque ? "#B84A32" : "#17352B", color: "#fff", fontSize: 14, padding: "4px 14px" }}
        >
          {destaque ? `${pendentes} aguardando atendimento humano` : "Nenhum cliente aguardando"}
        </span>
        <label style={{ ...s.campo, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <span>Seu nome:</span>
          <input style={{ ...s.input, width: 180 }} value={atendente} onChange={(e) => setAtendente(e.target.value)} placeholder="quem está atendendo" />
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
        <p style={s.legenda}>Quando o agente passar uma conversa para a equipe, ela aparece aqui. Enquanto uma pessoa cuida, o agente não responde.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={s.tabela}>
            <thead>
              <tr><th style={s.th}>Cliente</th><th style={s.th}>Motivo</th><th style={s.th}>Última mensagem</th><th style={s.th}>Desde</th><th style={s.th}>Situação</th><th style={s.th} /></tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.transferencia_id} style={i.status === "aguardando" ? { background: "#2b1712" } : undefined}>
                  <td style={s.td}>{i.contato.nome || "sem nome"}<br /><small>{i.contato.telefone}</small></td>
                  <td style={s.td}>{ROTULO_MOTIVO[i.motivo] ?? i.motivo}</td>
                  <td style={s.td}>{i.ultima_mensagem || "—"}</td>
                  <td style={s.td}>{quando(i.criada_em)}</td>
                  <td style={s.td}>{i.status === "aguardando" ? <span style={{ ...s.selo, background: "#B84A32", color: "#fff" }}>aguardando</span> : <span style={{ ...s.selo, background: "#17352B", color: "#F1E7D2" }}>com {i.atendente}</span>}</td>
                  <td style={{ ...s.td, whiteSpace: "nowrap" }}><button type="button" style={s.botaoMiniOutline} onClick={() => abrir(i.transferencia_id)}>Abrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selecionado && (
        <div style={{ ...s.cartao, marginTop: 16, maxWidth: 720 }}>
          <strong>{selecionado.contato.nome || "Cliente"}</strong> · {selecionado.contato.telefone}
          <p style={s.legenda}>Motivo: {ROTULO_MOTIVO[selecionado.motivo] ?? selecionado.motivo}{selecionado.detalhe ? ` — ${selecionado.detalhe}` : ""}</p>
          <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {historico.map((m) => (
              <div key={m.id} style={{ alignSelf: m.direcao === "entrada" ? "flex-start" : "flex-end", maxWidth: "85%", background: m.direcao === "entrada" ? "#2a2a2a" : m.autor === "atendente" ? "#17352B" : "#3a3320", borderRadius: 8, padding: "6px 10px", fontSize: 13, whiteSpace: "pre-wrap" }}>
                <small style={{ opacity: 0.7 }}>{m.autor} · {quando(m.criada_em)}{m.status === "falhou" ? " · falhou" : m.status === "na_fila" ? " · na fila" : ""}</small>
                <div>{m.conteudo || "(conteúdo removido pela política de retenção)"}</div>
              </div>
            ))}
          </div>
          {selecionado.status === "aguardando" ? (
            <button type="button" style={s.botaoMini} onClick={() => acao(selecionado.transferencia_id, "assumir")}>Assumir atendimento</button>
          ) : (
            <>
              <textarea style={{ ...s.input, width: "100%", minHeight: 60 }} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva a resposta ao cliente" />
              <p style={s.legenda}>O número é exclusivo da API: a resposta vai pela fila de envio (respeita a janela de 24 h e os interruptores).</p>
              <button type="button" style={s.botaoMini} disabled={!texto.trim()} onClick={() => acao(selecionado.transferencia_id, "enviar")}>Enviar</button>
              <button type="button" style={s.botaoMiniOutline} onClick={() => acao(selecionado.transferencia_id, "devolver")}>Devolver ao agente</button>
              <button type="button" style={s.botaoMiniPerigo} onClick={() => acao(selecionado.transferencia_id, "encerrar")}>Encerrar</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
