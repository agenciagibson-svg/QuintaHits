"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Edicao } from "@/lib/edicao";
import type { EstadoIntegracoes } from "@/lib/integracoes";
import type { Mesa, Reserva } from "@/lib/reserva";
import type { Prontidao } from "@/lib/regrasEdicao";
import { cor, s, selo } from "./estilos";
import { dataLonga, dia, edicoesFuturas, mes, proximaEdicao, ROTULO_STATUS_EDICAO, TOM_STATUS_EDICAO } from "./util";
import type { Aba } from "./AdminDashboard";

type Regras = { migrado: false } | { migrado: true; prontidao: Prontidao; prontidaoSite: Prontidao };

type Passo = { titulo: string; feito: boolean; detalhe: string; aba?: Aba; acao?: string };

/** Tela inicial: o que importa hoje, em números, e o caminho até abrir as reservas. */
export default function VisaoGeral({ edicoes, aguardando, irPara }: { edicoes: Edicao[]; aguardando: number; irPara: (a: Aba) => void }) {
  const router = useRouter();
  const proxima = proximaEdicao(edicoes);
  const [integ, setInteg] = useState<EstadoIntegracoes | null>(null);
  const [mesas, setMesas] = useState<Mesa[] | null>(null);
  const [reservas, setReservas] = useState<Reserva[] | null>(null);
  const [regras, setRegras] = useState<Regras | null>(null);

  useEffect(() => {
    let vivo = true;
    const pegar = async <T,>(url: string): Promise<T | null> => {
      try {
        const r = await fetch(url);
        if (r.status === 401) { router.replace("/admin/login"); return null; }
        return r.ok ? ((await r.json()) as T) : null;
      } catch {
        return null;
      }
    };
    (async () => {
      const [i, m] = await Promise.all([pegar<EstadoIntegracoes>("/api/admin/integracoes"), pegar<{ mesas: Mesa[] }>("/api/admin/mesas")]);
      if (!vivo) return;
      setInteg(i);
      setMesas(m?.mesas ?? []);
      if (proxima) {
        const [r, g] = await Promise.all([
          pegar<{ reservas: Reserva[] }>(`/api/admin/reservas?edicao=${proxima.id}`),
          pegar<Regras>(`/api/admin/edicoes/${proxima.id}/regras`),
        ]);
        if (!vivo) return;
        setReservas(r?.reservas ?? []);
        setRegras(g);
      } else {
        setReservas([]);
      }
    })();
    return () => { vivo = false; };
  }, [proxima, router]);

  const ativas = (reservas ?? []).filter((r) => r.status === "aguardando" || r.status === "confirmada");
  const pessoas = (reservas ?? []).filter((r) => r.status === "confirmada").reduce((t, r) => t + r.pessoas, 0);
  const mesasAtivas = (mesas ?? []).filter((m) => m.ativa);
  const lugares = mesasAtivas.reduce((t, m) => t + m.lugares, 0);
  const futuras = edicoesFuturas(edicoes).slice(0, 5);

  const faltaRegras = regras && regras.migrado ? regras.prontidaoSite.faltando : null;
  const passos: Passo[] = [
    {
      titulo: "Banco de dados atualizado",
      feito: !!integ?.banco.migrado && !!integ?.banco.parte2,
      detalhe: integ ? (integ.banco.migrado && integ.banco.parte2 ? "Migrações parte 1 e parte 2 aplicadas." : "Falta aplicar migração no Supabase.") : "Verificando…",
      aba: "sistema",
    },
    {
      titulo: "Mesas cadastradas",
      feito: mesasAtivas.length > 0,
      detalhe: mesasAtivas.length ? `${mesasAtivas.length} mesas ativas · ${lugares} lugares.` : "Nenhuma mesa ativa ainda.",
      aba: "mesas",
      acao: "Abrir mapa",
    },
    {
      titulo: "Regras da próxima quinta preenchidas",
      feito: !!faltaRegras && faltaRegras.length === 0,
      detalhe: !proxima ? "Cadastre uma edição." : faltaRegras === null ? "Verificando…" : faltaRegras.length === 0 ? "Tudo preenchido e liberado para o site." : `Faltam ${faltaRegras.length} item(ns): ${faltaRegras.slice(0, 3).join("; ")}${faltaRegras.length > 3 ? "…" : ""}`,
      aba: "regras",
      acao: "Preencher",
    },
    {
      titulo: "WhatsApp conectado",
      feito: !!integ?.envio_real_liberado_agora,
      detalhe: integ?.envio_real_liberado_agora ? "Envio real liberado." : "Aguardando aprovação da Meta e credenciais. Hoje o atendimento roda em modo simulado.",
      aba: "sistema",
    },
    {
      titulo: "Reservas abertas no site",
      feito: !!integ?.reservas_site.aberto,
      detalhe: integ?.reservas_site.aberto ? "O público já pode reservar em /reservar." : "Fechado: o site mostra “abrem em breve”.",
      aba: "sistema",
    },
  ];
  const feitos = passos.filter((p) => p.feito).length;

  return (
    <>
      <div className="qh-kpis qh-compacto">
        <button type="button" className="qh-kpi" onClick={() => irPara("programacao")}>
          <span className="qh-kpi-rotulo">Próxima quinta</span>
          {proxima ? (
            <>
              <span className="qh-kpi-valor">{dia(proxima.data)} {mes(proxima.data).toUpperCase()}</span>
              <span className="qh-kpi-sub">{proxima.artista || "Atração a definir"}{proxima.horario ? ` · ${proxima.horario}` : ""}</span>
            </>
          ) : (
            <span className="qh-kpi-sub">Nenhuma edição cadastrada.</span>
          )}
        </button>
        <button type="button" className="qh-kpi" onClick={() => irPara("reservas")}>
          <span className="qh-kpi-rotulo">Reservas da noite</span>
          <span className="qh-kpi-valor">{reservas === null ? "–" : ativas.length}</span>
          <span className="qh-kpi-sub">{pessoas} pessoa(s) confirmada(s)</span>
        </button>
        <button type="button" className="qh-kpi" onClick={() => irPara("atendimento")} style={aguardando > 0 ? { borderColor: cor.terracota } : undefined}>
          <span className="qh-kpi-rotulo">Atendimento</span>
          <span className="qh-kpi-valor" style={aguardando > 0 ? { color: "#f0a18d" } : undefined}>{aguardando}</span>
          <span className="qh-kpi-sub">{aguardando > 0 ? "cliente(s) esperando a equipe" : "ninguém esperando"}</span>
        </button>
        <button type="button" className="qh-kpi" onClick={() => irPara("mesas")}>
          <span className="qh-kpi-rotulo">Mesas ativas</span>
          <span className="qh-kpi-valor">{mesas === null ? "–" : mesasAtivas.length}</span>
          <span className="qh-kpi-sub">{lugares} lugares no salão</span>
        </button>
      </div>

      <div className="qh-duas">
        <section style={s.secao}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <h2 style={s.h2}>Caminho para abrir as reservas</h2>
            <span style={{ fontSize: 13, color: cor.suave, whiteSpace: "nowrap" }}>{feitos} de {passos.length}</span>
          </div>
          <div className="qh-barra"><span style={{ width: `${(feitos / passos.length) * 100}%` }} /></div>
          <div>
            {passos.map((p, i) => (
              <div key={p.titulo} className="qh-passo">
                <span className="qh-bola" style={p.feito ? { background: "rgba(143,214,170,0.16)", color: cor.verdeClaro } : { background: "rgba(241,231,210,0.07)", color: cor.suave }}>
                  {p.feito ? "✓" : i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: p.feito ? cor.suave : cor.texto }}>{p.titulo}</div>
                  <div style={{ fontSize: 13, color: cor.suave }}>{p.detalhe}</div>
                </div>
                {!p.feito && p.aba && p.acao && (
                  <button type="button" style={s.botaoMiniOutline} onClick={() => irPara(p.aba!)}>{p.acao}</button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section style={s.secao}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <h2 style={s.h2}>Próximas quintas</h2>
            <button type="button" style={{ ...s.botaoMiniOutline, marginRight: 0 }} onClick={() => irPara("programacao")}>Ver todas</button>
          </div>
          {futuras.length === 0 ? (
            <p style={{ ...s.legenda, marginTop: 12 }}>Nenhuma edição futura cadastrada.</p>
          ) : (
            <div style={{ marginTop: 8 }}>
              {futuras.map((e) => (
                <div key={e.id} className="qh-linha-ed">
                  <div className="qh-data"><b>{dia(e.data)}</b><small>{mes(e.data)}</small></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.artista || "Atração a definir"}</div>
                    <div style={{ fontSize: 12, color: cor.suave }}>{dataLonga(e.data)}{e.horario ? ` · ${e.horario}` : ""}</div>
                  </div>
                  <span style={selo(TOM_STATUS_EDICAO[e.status])}>{ROTULO_STATUS_EDICAO[e.status]}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
