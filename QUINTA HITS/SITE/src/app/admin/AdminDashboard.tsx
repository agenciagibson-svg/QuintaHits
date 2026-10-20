"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cssAdmin, s } from "./estilos";
import AtendimentoPainel from "./AtendimentoPainel";
import AuditoriaPainel from "./AuditoriaPainel";
import CasaPainel from "./CasaPainel";
import IntegracoesPainel from "./IntegracoesPainel";
import MesasEditor from "./MesasEditor";
import ProgramacaoPainel from "./ProgramacaoPainel";
import RegrasEdicaoPainel from "./RegrasEdicaoPainel";
import ReservasPainel from "./ReservasPainel";
import VisaoGeral from "./VisaoGeral";
import {
  IconeCalendario, IconeCasa, IconeConversa, IconeExterno, IconeInicio, IconeMesas, IconeRegras, IconeReserva, IconeSair, IconeSistema,
} from "./Icones";
import type { Edicao } from "@/lib/edicao";
import { CASAS, CASA_IDS, CASA_PADRAO, casaDaEdicaoId, ehCasa, type CasaId } from "@/config/casas";

const CHAVE_CASA = "qh-painel-casa";

export type PedidoPendente = { id: string; edicao_id: string; created_at: string };

export type Aba = "inicio" | "atendimento" | "reservas" | "programacao" | "regras" | "mesas" | "casa" | "sistema";

type ItemMenu = { aba: Aba; rotulo: string; icone: ReactNode; titulo: string; descricao: string; grupo: "Operação" | "Configuração" };

const MENU: ItemMenu[] = [
  { aba: "inicio", rotulo: "Início", icone: <IconeInicio />, grupo: "Operação", titulo: "Visão geral", descricao: "O que importa para a próxima quinta, num relance." },
  { aba: "atendimento", rotulo: "Atendimento", icone: <IconeConversa />, grupo: "Operação", titulo: "Atendimento", descricao: "Conversas do WhatsApp que o agente passou para a equipe. Enquanto uma pessoa cuida, o agente não responde." },
  { aba: "reservas", rotulo: "Reservas", icone: <IconeReserva />, grupo: "Operação", titulo: "Reservas", descricao: "Pedidos de mesa de cada noite. Confirme ou recuse e avise o cliente pelo WhatsApp com a mensagem pronta." },
  { aba: "programacao", rotulo: "Programação", icone: <IconeCalendario />, grupo: "Operação", titulo: "Programação", descricao: "As quintas da agenda: atração, horário, local e status. É o que aparece em /programacao." },
  { aba: "regras", rotulo: "Regras da noite", icone: <IconeRegras />, grupo: "Configuração", titulo: "Regras da noite", descricao: "Prazos, valores e canais de cada edição. A reserva só abre quando tudo está preenchido e liberado." },
  { aba: "mesas", rotulo: "Mesas", icone: <IconeMesas />, grupo: "Configuração", titulo: "Mesas", descricao: "O mapa que o cliente vê em /reservar. Mesa desativada some do site." },
  { aba: "casa", rotulo: "Casa", icone: <IconeCasa />, grupo: "Configuração", titulo: "Dados da casa", descricao: "Endereço, Instagram e link de reserva usados em todo o site." },
  { aba: "sistema", rotulo: "Sistema", icone: <IconeSistema />, grupo: "Configuração", titulo: "Sistema", descricao: "Estado das integrações (WhatsApp, banco, site) e histórico de ações da equipe." },
];

const ABAS = MENU.map((m) => m.aba);
/** Abas que valem só para a Quinta Hits (WhatsApp e dados do site): somem quando outra casa está escolhida. */
const SO_DA_QUINTA: Aba[] = ["atendimento", "casa"];
const ehAba = (v: string): v is Aba => (ABAS as string[]).includes(v);

export default function AdminDashboard() {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("inicio");
  const [visitadas, setVisitadas] = useState<Set<Aba>>(() => new Set<Aba>(["inicio"]));
  const [edicoes, setEdicoes] = useState<Edicao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aguardando, setAguardando] = useState(0);
  const [visitaInicio, setVisitaInicio] = useState(0);
  const [pendentes, setPendentes] = useState<PedidoPendente[]>([]);
  // Casa escolhida no painel (programação, reservas, regras e mesas são de cada casa). Lembrada neste navegador.
  const [casa, setCasa] = useState<CasaId>(CASA_PADRAO);
  useEffect(() => {
    try {
      const salva = window.localStorage.getItem(CHAVE_CASA);
      if (ehCasa(salva) && salva !== CASA_PADRAO) {
        setCarregando(true);
        setCasa(salva);
      }
    } catch {
      // sem armazenamento local: começa na Quinta Hits
    }
  }, []);
  function trocarCasa(nova: CasaId) {
    setCasa(nova);
    setCarregando(true);
    try {
      window.localStorage.setItem(CHAVE_CASA, nova);
    } catch {
      // ignora: só não lembra a escolha
    }
    if (nova !== CASA_PADRAO && SO_DA_QUINTA.includes(aba)) irPara("inicio");
  }
  const pendentesDaCasa = pendentes.filter((p) => casaDaEdicaoId(p.edicao_id) === casa);
  const pendentesPorCasa = (c: CasaId) => pendentes.filter((p) => casaDaEdicaoId(p.edicao_id) === c).length;

  const carregarPendentes = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reservas?pendentes=1");
      if (res.ok) setPendentes((await res.json()).pendentes ?? []);
    } catch {
      // sem conexão: tenta de novo no próximo ciclo
    }
  }, []);

  // Pedidos novos do site: contador no menu, atualizado a cada 30 s.
  useEffect(() => {
    carregarPendentes();
    const t = setInterval(carregarPendentes, 30_000);
    return () => clearInterval(t);
  }, [carregarPendentes]);

  // Troca rápida de casa: só a resposta da casa escolhida por último preenche o painel.
  const casaPedida = useRef(casa);
  const carregarEdicoes = useCallback(async () => {
    casaPedida.current = casa;
    setErro("");
    try {
      const res = await fetch(`/api/admin/edicoes?casa=${casa}`);
      if (res.status === 401) return router.replace("/admin/login");
      if (!res.ok) throw new Error();
      const lista = (await res.json()).edicoes ?? [];
      if (casaPedida.current === casa) setEdicoes(lista);
    } catch {
      if (casaPedida.current === casa) setErro("Não foi possível carregar os dados. Tente recarregar a página.");
    } finally {
      if (casaPedida.current === casa) setCarregando(false);
    }
  }, [router, casa]);

  useEffect(() => { carregarEdicoes(); }, [carregarEdicoes]);

  const irPara = useCallback((nova: Aba) => {
    setAba(nova);
    setVisitadas((v) => (v.has(nova) ? v : new Set(v).add(nova)));
    if (nova === "inicio") setVisitaInicio((n) => n + 1);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", nova === "inicio" ? "/admin" : `/admin#${nova}`);
      window.scrollTo({ top: 0 });
    }
  }, []);

  // Abre direto na seção do endereço (/admin#reservas) e acompanha o botão voltar do navegador.
  useEffect(() => {
    const doHash = () => {
      const h = window.location.hash.replace("#", "");
      if (ehAba(h)) {
        setAba(h);
        setVisitadas((v) => (v.has(h) ? v : new Set(v).add(h)));
      }
    };
    doHash();
    window.addEventListener("hashchange", doHash);
    return () => window.removeEventListener("hashchange", doHash);
  }, []);

  async function sair() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  const atual = MENU.find((m) => m.aba === aba)!;
  const grupos = ["Operação", "Configuração"] as const;

  /** Seções já abertas continuam montadas (não perdem o que foi digitado); só a atual aparece. */
  const painel = (qual: Aba, conteudo: ReactNode) => (visitadas.has(qual) ? <div hidden={aba !== qual}>{conteudo}</div> : null);

  return (
    <div style={s.pagina}>
      <style>{cssAdmin}</style>
      <div className="qh-shell">
        <aside className="qh-lateral">
          <div className="qh-marca">
            QUINTA HITS
            <small>Painel da casa</small>
          </div>
          <label className="qh-casa">
            <span>Casa</span>
            <select value={casa} onChange={(e) => ehCasa(e.target.value) && trocarCasa(e.target.value)}>
              {CASA_IDS.map((c) => (
                <option key={c} value={c}>
                  {CASAS[c].rotulo}{pendentesPorCasa(c) > 0 ? ` (${pendentesPorCasa(c)} para confirmar)` : ""}
                </option>
              ))}
            </select>
          </label>
          <nav className="qh-nav" aria-label="Seções do painel">
            {grupos.map((g) => (
              <div key={g} style={{ display: "contents" }}>
                <div className="qh-nav-grupo">{g}</div>
                {MENU.filter((m) => m.grupo === g && (casa === CASA_PADRAO || !SO_DA_QUINTA.includes(m.aba))).map((m) => (
                  <button key={m.aba} type="button" className="qh-item" aria-current={aba === m.aba ? "page" : undefined} onClick={() => irPara(m.aba)}>
                    {m.icone}
                    {m.rotulo}
                    {m.aba === "atendimento" && aguardando > 0 && <span className="qh-badge" aria-label={`${aguardando} aguardando`}>{aguardando}</span>}
                    {m.aba === "reservas" && pendentesDaCasa.length > 0 && <span className="qh-badge" style={{ background: "#D5A62A", color: "#171717" }} aria-label={`${pendentesDaCasa.length} para confirmar`}>{pendentesDaCasa.length}</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="qh-rodape">
            <a className="qh-item qh-site" href={casa === CASA_PADRAO ? "/" : CASAS[casa].pagina} target="_blank" rel="noopener noreferrer"><IconeExterno /> Ver o site</a>
            <button type="button" className="qh-item" onClick={sair}><IconeSair /> Sair</button>
          </div>
        </aside>

        <main className="qh-main">
          <div className="qh-conteudo">
            <header className="qh-cabecalho">
              <div>
                <h1>{atual.titulo}{casa !== CASA_PADRAO && !SO_DA_QUINTA.includes(aba) && aba !== "sistema" ? ` · ${CASAS[casa].nome}` : ""}</h1>
                <p>{atual.descricao.replace("/reservar", CASAS[casa].pagina)}</p>
              </div>
            </header>

            {erro && <div style={s.avisoErro}>{erro}</div>}

            {carregando ? (
              <p style={s.legenda}>Carregando…</p>
            ) : (
              <>
                {aba === "inicio" && <VisaoGeral key={`${casa}-${visitaInicio}`} casa={casa} edicoes={edicoes} aguardando={aguardando} pendentes={pendentesDaCasa.length} irPara={irPara} />}
                {/* Sempre montado: mantém o contador de atendimento do menu atualizado. */}
                <div hidden={aba !== "atendimento"}><AtendimentoPainel onContagem={setAguardando} /></div>
                {/* key = casa: trocar de casa remonta o painel do zero (nada da outra casa fica na tela). */}
                {painel("reservas", <ReservasPainel key={casa} casa={casa} edicoes={edicoes} pendentes={pendentesDaCasa} onMudou={carregarPendentes} />)}
                {painel("programacao", <ProgramacaoPainel key={casa} casa={casa} edicoes={edicoes} recarregar={carregarEdicoes} />)}
                {painel("regras", <RegrasEdicaoPainel key={casa} casa={casa} edicoes={edicoes} />)}
                {painel("mesas", <MesasEditor key={casa} casa={casa} />)}
                {painel("casa", <CasaPainel />)}
                {painel("sistema", <><IntegracoesPainel /><AuditoriaPainel /></>)}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
