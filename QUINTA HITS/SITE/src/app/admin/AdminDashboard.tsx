"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
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

export type Aba = "inicio" | "atendimento" | "reservas" | "programacao" | "regras" | "mesas" | "casa" | "sistema";

type ItemMenu = { aba: Aba; rotulo: string; icone: ReactNode; titulo: string; descricao: string; grupo: "Operação" | "Configuração" };

const MENU: ItemMenu[] = [
  { aba: "inicio", rotulo: "Início", icone: <IconeInicio />, grupo: "Operação", titulo: "Visão geral", descricao: "O que importa para a próxima quinta, num relance." },
  { aba: "atendimento", rotulo: "Atendimento", icone: <IconeConversa />, grupo: "Operação", titulo: "Atendimento", descricao: "Conversas do WhatsApp que o agente passou para a equipe. Enquanto uma pessoa cuida, o agente não responde." },
  { aba: "reservas", rotulo: "Reservas", icone: <IconeReserva />, grupo: "Operação", titulo: "Reservas", descricao: "Pedidos de mesa de cada noite. Confirme à mão só se o cliente não conseguir enviar o código pelo WhatsApp." },
  { aba: "programacao", rotulo: "Programação", icone: <IconeCalendario />, grupo: "Operação", titulo: "Programação", descricao: "As quintas da agenda: atração, horário, local e status. É o que aparece em /programacao." },
  { aba: "regras", rotulo: "Regras da noite", icone: <IconeRegras />, grupo: "Configuração", titulo: "Regras da noite", descricao: "Prazos, valores e canais de cada edição. A reserva só abre quando tudo está preenchido e liberado." },
  { aba: "mesas", rotulo: "Mesas", icone: <IconeMesas />, grupo: "Configuração", titulo: "Mesas", descricao: "O mapa que o cliente vê em /reservar. Mesa desativada some do site." },
  { aba: "casa", rotulo: "Casa", icone: <IconeCasa />, grupo: "Configuração", titulo: "Dados da casa", descricao: "Endereço, Instagram e link de reserva usados em todo o site." },
  { aba: "sistema", rotulo: "Sistema", icone: <IconeSistema />, grupo: "Configuração", titulo: "Sistema", descricao: "Estado das integrações (WhatsApp, banco, site) e histórico de ações da equipe." },
];

const ABAS = MENU.map((m) => m.aba);
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

  const carregarEdicoes = useCallback(async () => {
    setErro("");
    try {
      const res = await fetch("/api/admin/edicoes");
      if (res.status === 401) return router.replace("/admin/login");
      if (!res.ok) throw new Error();
      setEdicoes((await res.json()).edicoes ?? []);
    } catch {
      setErro("Não foi possível carregar os dados. Tente recarregar a página.");
    } finally {
      setCarregando(false);
    }
  }, [router]);

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
          <nav className="qh-nav" aria-label="Seções do painel">
            {grupos.map((g) => (
              <div key={g} style={{ display: "contents" }}>
                <div className="qh-nav-grupo">{g}</div>
                {MENU.filter((m) => m.grupo === g).map((m) => (
                  <button key={m.aba} type="button" className="qh-item" aria-current={aba === m.aba ? "page" : undefined} onClick={() => irPara(m.aba)}>
                    {m.icone}
                    {m.rotulo}
                    {m.aba === "atendimento" && aguardando > 0 && <span className="qh-badge" aria-label={`${aguardando} aguardando`}>{aguardando}</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="qh-rodape">
            <a className="qh-item qh-site" href="/" target="_blank" rel="noopener noreferrer"><IconeExterno /> Ver o site</a>
            <button type="button" className="qh-item" onClick={sair}><IconeSair /> Sair</button>
          </div>
        </aside>

        <main className="qh-main">
          <div className="qh-conteudo">
            <header className="qh-cabecalho">
              <div>
                <h1>{atual.titulo}</h1>
                <p>{atual.descricao}</p>
              </div>
            </header>

            {erro && <div style={s.avisoErro}>{erro}</div>}

            {carregando ? (
              <p style={s.legenda}>Carregando…</p>
            ) : (
              <>
                {aba === "inicio" && <VisaoGeral key={visitaInicio} edicoes={edicoes} aguardando={aguardando} irPara={irPara} />}
                {/* Sempre montado: mantém o contador de atendimento do menu atualizado. */}
                <div hidden={aba !== "atendimento"}><AtendimentoPainel onContagem={setAguardando} /></div>
                {painel("reservas", <ReservasPainel edicoes={edicoes} />)}
                {painel("programacao", <ProgramacaoPainel edicoes={edicoes} recarregar={carregarEdicoes} />)}
                {painel("regras", <RegrasEdicaoPainel edicoes={edicoes} />)}
                {painel("mesas", <MesasEditor />)}
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
