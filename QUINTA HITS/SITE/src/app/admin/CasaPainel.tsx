"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DIAS_DA_SEMANA } from "@/lib/regrasEdicao";
import { cor, s } from "./estilos";

type Config = {
  casa_endereco?: string;
  casa_bairro?: string;
  casa_instagram?: string;
  reserva_url?: string;
  horario_padrao?: string;
  /** Abertura semanal das reservas pelo site (0 = domingo … 6 = sábado); null = sem dia fixo. */
  reservas_abrem_dia?: number | null;
  reservas_abrem_hora?: string | null;
  /** O banco já tem as colunas da abertura semanal? */
  abertura_migrada?: boolean;
};

/** Dados da casa usados em todo o site. */
export default function CasaPainel() {
  const router = useRouter();
  const [config, setConfig] = useState<Config | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/config");
      if (res.status === 401) return router.replace("/admin/login");
      if (!res.ok) return setErro("Não foi possível carregar a configuração.");
      setConfig((await res.json()).config ?? {});
    })();
  }, [router]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    // Sem a migração da abertura semanal, não envia esses campos (o resto da configuração continua salvando normalmente).
    const { abertura_migrada, reservas_abrem_dia, reservas_abrem_hora, ...resto } = config ?? {};
    const corpo = abertura_migrada ? { ...resto, reservas_abrem_dia: reservas_abrem_dia ?? null, reservas_abrem_hora: reservas_abrem_hora ?? "" } : resto;
    const res = await fetch("/api/admin/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    setSalvando(false);
    if (res.status === 401) return router.replace("/admin/login");
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return setErro(j.erro || "Não foi possível salvar a configuração.");
    }
    setMsg("Configuração salva.");
    setTimeout(() => setMsg(""), 3000);
  }

  if (!config) return erro ? <div style={s.avisoErro}>{erro}</div> : <p style={s.legenda}>Carregando…</p>;
  const mudar = (k: keyof Config, v: string) => setConfig({ ...config, [k]: v });

  return (
    <section style={s.secao}>
      {msg && <div style={s.aviso}>{msg}</div>}
      {erro && <div style={s.avisoErro}>{erro}</div>}
      <form onSubmit={salvar} style={s.gridConfig}>
        <label style={s.campo}><span>Endereço</span>
          <input style={s.input} value={config.casa_endereco ?? ""} onChange={(e) => mudar("casa_endereco", e.target.value)} placeholder="Rua Exemplo, 123" /></label>
        <label style={s.campo}><span>Bairro</span>
          <input style={s.input} value={config.casa_bairro ?? ""} onChange={(e) => mudar("casa_bairro", e.target.value)} placeholder="Centro" /></label>
        <label style={s.campo}><span>Instagram da casa</span>
          <input style={s.input} value={config.casa_instagram ?? ""} onChange={(e) => mudar("casa_instagram", e.target.value)} placeholder="florindosbar (sem @)" /></label>
        <label style={s.campo}><span>Link de reserva</span>
          <input style={s.input} value={config.reserva_url ?? ""} onChange={(e) => mudar("reserva_url", e.target.value)} placeholder="https://..." /></label>
        <label style={s.campo}><span>Horário padrão</span>
          <input style={s.input} value={config.horario_padrao ?? ""} onChange={(e) => mudar("horario_padrao", e.target.value)} placeholder="20h" /></label>
        <fieldset style={{ gridColumn: "1 / -1", border: `1px solid ${cor.linhaForte}`, borderRadius: 10, padding: "12px 14px", margin: 0 }}>
          <legend style={{ padding: "0 6px", fontWeight: 600 }}>Abertura semanal das reservas pelo site</legend>
          {!config.abertura_migrada && (
            <div style={{ ...s.aviso, background: cor.alerta, marginInline: 0 }} role="note">
              Ainda não ativo neste banco: aplique <code>migracao-2026-10-05-abertura-semanal.sql</code> no SQL Editor do Supabase.
            </div>
          )}
          <p style={s.legenda}>
            Cada edição só aparece para reserva a partir do último dia escolhido antes dela (ou no próprio dia), no horário de Uberlândia. Ex.: segunda às 12h → a quinta abre na segunda da mesma semana. Ela também precisa estar completa e liberada em Regras da noite.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ ...s.campo, minWidth: 220 }}><span>Dia</span>
              <select
                style={s.input}
                disabled={!config.abertura_migrada}
                value={config.reservas_abrem_dia ?? ""}
                onChange={(e) => setConfig({ ...config, reservas_abrem_dia: e.target.value === "" ? null : Number(e.target.value), reservas_abrem_hora: e.target.value === "" ? "" : config.reservas_abrem_hora || "12h" })}
              >
                <option value="">Sem dia fixo (abre assim que a edição estiver completa)</option>
                {DIAS_DA_SEMANA.map((d, i) => <option key={d} value={i}>{d[0].toUpperCase() + d.slice(1)}</option>)}
              </select></label>
            <label style={{ ...s.campo, maxWidth: 160 }}><span>Horário</span>
              <input
                style={s.input}
                disabled={!config.abertura_migrada || config.reservas_abrem_dia === null || config.reservas_abrem_dia === undefined}
                value={config.reservas_abrem_hora ?? ""}
                onChange={(e) => setConfig({ ...config, reservas_abrem_hora: e.target.value })}
                placeholder="12h"
              /></label>
          </div>
        </fieldset>
        <button type="submit" style={s.botaoSalvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar configuração"}</button>
      </form>
    </section>
  );
}
