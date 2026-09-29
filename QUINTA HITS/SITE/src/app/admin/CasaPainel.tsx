"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { s } from "./estilos";

type Config = {
  casa_endereco?: string;
  casa_bairro?: string;
  casa_instagram?: string;
  reserva_url?: string;
  horario_padrao?: string;
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
    const res = await fetch("/api/admin/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
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
        <button type="submit" style={s.botaoSalvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar configuração"}</button>
      </form>
    </section>
  );
}
