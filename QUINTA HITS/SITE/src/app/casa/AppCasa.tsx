"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatData, hojeISO } from "@/lib/edicao";
import { formatarWhatsapp, type StatusReserva } from "@/lib/reserva";
import { linkWhatsappCliente } from "@/lib/mensagemCliente";

type EdicaoCasa = { id: string; data: string; artista: string; horario: string; local: string; status: string };
type ReservaCasa = {
  id: string;
  edicao_id: string;
  mesa_id: string;
  nome: string;
  whatsapp: string;
  pessoas: number;
  status: StatusReserva;
  codigo: string | null;
  created_at: string;
};
type MesaCasa = { id: string; numero: string; lugares: number; area: string };
type Dados = { edicoes: EdicaoCasa[]; reservas: ReservaCasa[]; mesas: MesaCasa[]; pendentes: number };
type Pergunta = { id: string; status: "confirmada" | "cancelada"; texto: string } | null;
type EstadoAvisos = "carregando" | "indisponivel" | "precisa-instalar" | "desativado" | "ativado" | "bloqueado";

/** Evento de instalação do Chrome/Android (não tipado no DOM padrão). */
type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const ROTULO: Record<StatusReserva, string> = { aguardando: "Para aprovar", confirmada: "Confirmada", cancelada: "Recusada", expirada: "Expirada" };
const ATUALIZAR_A_CADA_MS = 30_000;

function quando(iso: string): string {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return dia === hojeISO() ? `hoje às ${hora}` : `${formatData(dia, "numerica")} às ${hora}`;
}

function chaveParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

const ehIOS = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalado = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

function lerPreferencia(chave: string): boolean {
  try {
    return localStorage.getItem(chave) === "1";
  } catch {
    return false;
  }
}
function gravarPreferencia(chave: string) {
  try {
    localStorage.setItem(chave, "1");
  } catch {
    /* modo privado: só não lembra */
  }
}

export default function AppCasa({ edicaoInicial }: { edicaoInicial?: string }) {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);
  const [edicaoId, setEdicaoId] = useState(edicaoInicial ?? "");
  const [erro, setErro] = useState("");
  const [toast, setToast] = useState("");
  const [ocupados, setOcupados] = useState<ReadonlySet<string>>(new Set());
  const [pergunta, setPergunta] = useState<Pergunta>(null);
  const [avisar, setAvisar] = useState<Record<string, true>>({});
  const [avisos, setAvisos] = useState<EstadoAvisos>("carregando");
  const [instalar, setInstalar] = useState<EventoInstalar | null>(null);
  const [mostrarInstalar, setMostrarInstalar] = useState(false);
  const chavePush = useRef<string | null>(null);
  const timerToast = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mostrarToast = useCallback((texto: string) => {
    setToast(texto);
    if (timerToast.current) clearTimeout(timerToast.current);
    timerToast.current = setTimeout(() => setToast(""), 3500);
  }, []);

  // Cada consulta ganha um número; resposta de consulta mais antiga (ex.: a automática de 30 s que voltou depois de uma
  // aprovação) é ignorada, para não "desfazer" na tela o que acabou de ser salvo.
  const ultimaConsulta = useRef(0);
  const carregar = useCallback(async () => {
    const minha = ++ultimaConsulta.current;
    try {
      const res = await fetch("/api/casa/reservas", { cache: "no-store" });
      if (res.status === 401) return router.replace("/casa/login");
      const j = await res.json().catch(() => ({}));
      if (minha !== ultimaConsulta.current) return;
      if (!res.ok) throw new Error(j.erro);
      setDados(j as Dados);
      setErro("");
      setEdicaoId((atual) => {
        const lista = (j as Dados).edicoes;
        if (atual && lista.some((e) => e.id === atual)) return atual;
        const comPedido = lista.find((e) => (j as Dados).reservas.some((r) => r.edicao_id === e.id && r.status === "aguardando"));
        return (comPedido ?? lista[0])?.id ?? "";
      });
    } catch (e) {
      if (minha === ultimaConsulta.current) setErro(e instanceof Error && e.message ? e.message : "Sem conexão. Tentando de novo…");
    }
  }, [router]);

  // Carrega, atualiza a cada 30 s com o app aberto e na hora em que ele volta para a frente.
  useEffect(() => {
    carregar();
    const intervalo = setInterval(() => document.visibilityState === "visible" && carregar(), ATUALIZAR_A_CADA_MS);
    const aoVoltar = () => document.visibilityState === "visible" && carregar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [carregar]);

  // App instalável: service worker (avisos) e convite para instalar.
  useEffect(() => {
    const aoPoderInstalar = (e: Event) => {
      e.preventDefault();
      setInstalar(e as EventoInstalar);
    };
    window.addEventListener("beforeinstallprompt", aoPoderInstalar);
    setMostrarInstalar(!instalado() && !lerPreferencia("qh-casa-sem-instalar"));

    (async () => {
      if (!("serviceWorker" in navigator)) return setAvisos("indisponivel");
      try {
        await navigator.serviceWorker.register("/casa-sw.js", { scope: "/casa" });
      } catch {
        return setAvisos("indisponivel");
      }
      if (!("PushManager" in window) || !("Notification" in window)) return setAvisos(ehIOS() && !instalado() ? "precisa-instalar" : "indisponivel");
      const cfg = await fetch("/api/casa/push").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!cfg?.disponivel || !cfg.chavePublica) return setAvisos("indisponivel");
      chavePush.current = cfg.chavePublica;
      if (Notification.permission === "denied") return setAvisos("bloqueado");
      const reg = await navigator.serviceWorker.ready;
      const inscricao = await reg.pushManager.getSubscription();
      if (inscricao) {
        // Reenvia em silêncio: garante que o servidor conhece este celular (ex.: depois de reinstalar o app).
        fetch("/api/casa/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inscricao: inscricao.toJSON() }) }).catch(() => undefined);
        setAvisos("ativado");
      } else setAvisos("desativado");
    })().catch(() => setAvisos("indisponivel"));

    return () => window.removeEventListener("beforeinstallprompt", aoPoderInstalar);
  }, []);

  async function ativarAvisos() {
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") return setAvisos(permissao === "denied" ? "bloqueado" : "desativado");
      const reg = await navigator.serviceWorker.ready;
      const inscricao = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chavePush.current ?? "") });
      const res = await fetch("/api/casa/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inscricao: inscricao.toJSON() }) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        await inscricao.unsubscribe().catch(() => undefined);
        return mostrarToast(j.erro || "Não foi possível ativar os avisos.");
      }
      setAvisos("ativado");
      mostrarToast("Pronto! Você vai receber um aviso a cada pedido novo.");
    } catch {
      mostrarToast("Não foi possível ativar os avisos neste celular.");
    }
  }

  async function desativarAvisos() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const inscricao = await reg.pushManager.getSubscription();
      if (inscricao) {
        await fetch("/api/casa/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: inscricao.endpoint }) }).catch(() => undefined);
        await inscricao.unsubscribe();
      }
      setAvisos("desativado");
      mostrarToast("Avisos desligados neste celular.");
    } catch {
      mostrarToast("Não foi possível desligar os avisos.");
    }
  }

  async function instalarApp() {
    if (!instalar) return;
    await instalar.prompt();
    const { outcome } = await instalar.userChoice;
    setInstalar(null);
    if (outcome === "accepted") setMostrarInstalar(false);
  }

  /** Sair também desliga os avisos deste celular (aparelho emprestado ou trocado não continua recebendo pedidos). */
  async function sair() {
    try {
      const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration("/casa") : undefined;
      const inscricao = await reg?.pushManager?.getSubscription();
      if (inscricao) {
        await fetch("/api/casa/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: inscricao.endpoint }) }).catch(() => undefined);
        await inscricao.unsubscribe().catch(() => undefined);
      }
    } catch {
      /* sem service worker: nada a desligar */
    }
    await fetch("/api/casa/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/casa/login");
  }

  async function mudarStatus(r: ReservaCasa, status: "confirmada" | "cancelada") {
    setPergunta(null);
    ultimaConsulta.current++; // invalida qualquer consulta já em andamento
    setOcupados((o) => new Set(o).add(r.id));
    try {
      const res = await fetch(`/api/casa/reservas/${r.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (res.status === 401) return router.replace("/casa/login");
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        mostrarToast(j.erro || "Não foi possível mudar a reserva.");
        return;
      }
      setDados((d) => (d ? { ...d, reservas: d.reservas.map((x) => (x.id === r.id ? { ...x, status } : x)) } : d));
      setAvisar((a) => ({ ...a, [r.id]: true }));
      mostrarToast(status === "confirmada" ? "Reserva aprovada. Agora avise o cliente no WhatsApp." : "Pedido recusado. A mesa voltou a ficar livre.");
    } catch {
      mostrarToast("Sem conexão. Tente de novo.");
    } finally {
      setOcupados((o) => {
        const n = new Set(o);
        n.delete(r.id);
        return n;
      });
      carregar();
    }
  }

  const edicao = dados?.edicoes.find((e) => e.id === edicaoId);
  const numeroMesa = useCallback((id: string) => dados?.mesas.find((m) => m.id === id)?.numero ?? "?", [dados]);
  const daNoite = useMemo(() => (dados?.reservas ?? []).filter((r) => r.edicao_id === edicaoId), [dados, edicaoId]);
  const aguardando = daNoite.filter((r) => r.status === "aguardando");
  const confirmadas = daNoite.filter((r) => r.status === "confirmada");
  const encerradas = daNoite.filter((r) => r.status === "cancelada" || r.status === "expirada");
  const pessoas = confirmadas.reduce((t, r) => t + r.pessoas, 0);

  /** Cartão de um pedido (função de renderização, não componente: não remonta a cada atualização da lista). */
  function cartao(r: ReservaCasa) {
    const mesa = numeroMesa(r.mesa_id);
    const whats = linkWhatsappCliente(r, edicao, mesa);
    const aqui = pergunta?.id === r.id ? pergunta : null;
    const trabalhando = ocupados.has(r.id);
    const classe = `cs-cartao${r.status === "aguardando" ? " cs-aguardando" : ""}${r.status === "cancelada" || r.status === "expirada" ? " cs-apagado" : ""}`;
    return (
      <article key={r.id} className={classe} aria-label={`Mesa ${mesa}, ${r.nome}`}>
        <div className="cs-mesa" aria-hidden="true">
          <small>MESA</small>
          {mesa}
        </div>
        <div className="cs-nome">
          {r.nome}
          <span className={`cs-selo cs-selo-${r.status}`}>{ROTULO[r.status]}</span>
        </div>
        <div className="cs-detalhes">
          {r.pessoas} pessoa{r.pessoas > 1 ? "s" : ""} · {formatarWhatsapp(r.whatsapp)}
          <br />
          Pedido {quando(r.created_at)}
        </div>

        {aqui ? (
          <>
            <div className="cs-pergunta">{aqui.texto}</div>
            <div className="cs-acoes">
              <button className="cs-btn cs-btn-neutro" onClick={() => setPergunta(null)}>Voltar</button>
              <button className={`cs-btn ${aqui.status === "confirmada" ? "cs-btn-aprovar" : "cs-btn-perigo"}`} disabled={trabalhando} onClick={() => mudarStatus(r, aqui.status)}>
                {aqui.status === "confirmada" ? "Sim, confirmar" : "Sim, recusar"}
              </button>
            </div>
          </>
        ) : (
          <div className="cs-acoes">
            {r.status === "aguardando" && (
              <>
                <button className="cs-btn cs-btn-recusar" disabled={trabalhando} onClick={() => setPergunta({ id: r.id, status: "cancelada", texto: `Recusar o pedido de ${r.nome}? A mesa ${mesa} volta a ficar livre no site.` })}>
                  Recusar
                </button>
                <button className="cs-btn cs-btn-aprovar" disabled={trabalhando} onClick={() => mudarStatus(r, "confirmada")}>
                  {trabalhando ? "Salvando…" : "Aprovar"}
                </button>
              </>
            )}
            {r.status !== "aguardando" && (
              <a className="cs-btn cs-btn-whats" href={whats} target="_blank" rel="noopener noreferrer">
                {avisar[r.id] ? "Avisar cliente no WhatsApp" : "WhatsApp"}
              </a>
            )}
            {r.status === "confirmada" && !avisar[r.id] && (
              <button className="cs-btn cs-btn-neutro" disabled={trabalhando} onClick={() => setPergunta({ id: r.id, status: "cancelada", texto: `Cancelar a reserva de ${r.nome}? A mesa ${mesa} volta a ficar livre no site.` })}>
                Cancelar
              </button>
            )}
            {(r.status === "cancelada" || r.status === "expirada") && !avisar[r.id] && (
              <button className="cs-btn cs-btn-neutro" disabled={trabalhando} onClick={() => setPergunta({ id: r.id, status: "confirmada", texto: `Confirmar a mesa ${mesa} para ${r.nome}?` })}>
                Confirmar
              </button>
            )}
            {r.status === "aguardando" && (
              <a className="cs-btn cs-btn-neutro" style={{ flexBasis: "100%" }} href={whats} target="_blank" rel="noopener noreferrer">
                Falar com o cliente no WhatsApp
              </a>
            )}
          </div>
        )}
      </article>
    );
  }

  return (
    <>
      <header className="cs-topo">
        <div className="cs-topo-linha">
          <div>
            <div className="cs-marca">QUINTA HITS · FLORINDOS BAR</div>
            <h1 className="cs-titulo">Reservas</h1>
          </div>
          <button className="cs-botao-topo" onClick={sair}>Sair</button>
        </div>
      </header>

      {dados && dados.edicoes.length > 0 && (
        <nav className="cs-quintas" aria-label="Quintas">
          {dados.edicoes.map((e) => {
            const n = dados.reservas.filter((r) => r.edicao_id === e.id && r.status === "aguardando").length;
            return (
              <button key={e.id} className="cs-quinta" aria-pressed={e.id === edicaoId} onClick={() => setEdicaoId(e.id)}>
                <span className="cs-quinta-data">QUI {formatData(e.data, "numerica")}</span>
                <span className="cs-quinta-artista">{e.artista || "Line-up em breve"}</span>
                {n > 0 && <span className="cs-contador" aria-label={`${n} para aprovar`}>{n}</span>}
              </button>
            );
          })}
        </nav>
      )}

      <div className="cs-conteudo">
        {mostrarInstalar && (instalar || ehIOS()) && (
          <div className="cs-aviso">
            <strong>Instale o app no celular.</strong>{" "}
            {instalar ? "Fica na tela inicial, como um aplicativo." : "No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”."}
            <div style={{ display: "flex", gap: 8 }}>
              {instalar && <button className="cs-btn cs-btn-aprovar" onClick={instalarApp}>Instalar</button>}
              <button className="cs-btn cs-btn-neutro" onClick={() => { gravarPreferencia("qh-casa-sem-instalar"); setMostrarInstalar(false); }}>Agora não</button>
            </div>
          </div>
        )}

        {avisos === "desativado" && (
          <div className="cs-aviso">
            <strong>Receba um aviso a cada pedido novo.</strong> O celular avisa mesmo com o app fechado.
            <div><button className="cs-btn cs-btn-aprovar" onClick={ativarAvisos}>Ativar avisos</button></div>
          </div>
        )}
        {avisos === "precisa-instalar" && <div className="cs-aviso">No iPhone, os avisos de pedido novo funcionam depois de instalar o app na tela inicial.</div>}
        {avisos === "bloqueado" && <div className="cs-aviso">Os avisos estão bloqueados para este app. Libere nas configurações de notificação do celular.</div>}

        {erro && <div className="cs-erro" role="alert">{erro}</div>}

        {!dados ? (
          <p className="cs-vazio">Carregando…</p>
        ) : dados.edicoes.length === 0 ? (
          <p className="cs-vazio">Nenhuma quinta programada por enquanto.</p>
        ) : (
          <>
            {edicao && (
              <p style={{ margin: "4px 0 12px", fontSize: 15 }}>
                <strong>{formatData(edicao.data, "longa")}</strong>
                {edicao.horario ? ` · ${edicao.horario}` : ""}
                {edicao.artista ? ` · ${edicao.artista}` : ""}
              </p>
            )}
            <div className="cs-resumo">
              <div className={aguardando.length ? "cs-destaque" : undefined}><strong>{aguardando.length}</strong><span>para aprovar</span></div>
              <div><strong>{confirmadas.length}</strong><span>mesas confirmadas</span></div>
              <div><strong>{pessoas}</strong><span>pessoas</span></div>
            </div>

            {daNoite.length === 0 && <p className="cs-vazio">Nenhum pedido para esta quinta ainda. Os pedidos do site aparecem aqui na hora.</p>}

            {aguardando.length > 0 && (
              <>
                <h2 className="cs-secao-titulo">Para aprovar <small>{aguardando.length}</small></h2>
                {aguardando.map(cartao)}
              </>
            )}
            {confirmadas.length > 0 && (
              <>
                <h2 className="cs-secao-titulo">Confirmadas <small>{confirmadas.length}</small></h2>
                {confirmadas.map(cartao)}
              </>
            )}
            {encerradas.length > 0 && (
              <details className="cs-detalhes-recolhidos">
                <summary>Recusadas e expiradas ({encerradas.length})</summary>
                {encerradas.map(cartao)}
              </details>
            )}
          </>
        )}

        {avisos === "ativado" && (
          <p className="cs-rodape">
            Avisos de pedido novo ligados neste celular ·{" "}
            <button onClick={desativarAvisos} style={{ background: "none", border: 0, padding: 0, textDecoration: "underline", color: "inherit", fontSize: 12 }}>desligar</button>
          </p>
        )}
        <p className="cs-rodape">A lista se atualiza sozinha a cada 30 segundos. Pedido sem resposta expira no fim do dia da quinta.</p>
      </div>

      {toast && <div className="cs-toast" role="status">{toast}</div>}
    </>
  );
}
