"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cor, s } from "./estilos";

type Item = { id: number; ator: string; acao: string; entidade: string; entidade_id: string | null; detalhe: Record<string, unknown>; criado_em: string };

const legivel = (v: string) => v.replace(/_/g, " ");
const frase = (v: string) => { const t = legivel(v); return t.charAt(0).toUpperCase() + t.slice(1); };
const detalheLegivel = (d: Record<string, unknown>) =>
  Object.entries(d ?? {})
    .map(([k, v]) => `${legivel(k)}: ${Array.isArray(v) ? v.join(", ") : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(" · ");

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Últimas ações registradas: quem fez o quê. O detalhe traz só nomes de campos e contagens (nunca segredos nem conteúdo de conversa). */
export default function AuditoriaPainel() {
  const router = useRouter();
  const [itens, setItens] = useState<Item[]>([]);
  const [migrado, setMigrado] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/auditoria?limite=100");
      if (res.status === 401) return router.replace("/admin/login");
      if (!res.ok) throw new Error();
      const j = await res.json();
      setMigrado(j.migrado !== false);
      setItens(j.itens ?? []);
      setErro("");
    } catch {
      setErro("Não foi possível carregar a auditoria.");
    }
  }, [router]);

  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <div style={s.avisoErro}>{erro}</div>;
  if (!migrado) return <p style={s.legenda}>A auditoria depende da migração do agente, ainda não aplicada neste banco.</p>;
  return (
    <section style={{ ...s.secao, padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "18px 22px 8px" }}>
        <div>
          <h2 style={s.h2}>Histórico de ações</h2>
          <p style={{ ...s.legenda, margin: 0 }}>Quem fez o quê no painel e no atendimento (últimas 100 ações).</p>
        </div>
        <button type="button" style={{ ...s.botaoMiniOutline, marginRight: 0 }} onClick={carregar}>Atualizar</button>
      </div>
      {itens.length === 0 ? (
        <p style={{ ...s.legenda, padding: "0 22px 18px" }}>Nenhuma ação registrada ainda.</p>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
          <table style={s.tabela} className="qh-tabela">
            <thead><tr><th style={s.th}>Quando</th><th style={s.th}>Quem</th><th style={s.th}>Ação</th><th style={s.th}>Detalhe</th></tr></thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id}>
                  <td style={{ ...s.td, whiteSpace: "nowrap", color: cor.suave }}>{quando(i.criado_em)}</td>
                  <td style={s.td}>{i.ator}</td>
                  <td style={s.td}>
                    <div style={{ fontWeight: 600 }}>{frase(i.acao)}</div>
                    <div style={{ fontSize: 12, color: cor.suave }}>{legivel(i.entidade)}{i.entidade_id ? ` ${i.entidade_id.slice(0, 8)}` : ""}</div>
                  </td>
                  <td style={{ ...s.td, fontSize: 12, color: cor.suave }}>{Object.keys(i.detalhe ?? {}).length ? detalheLegivel(i.detalhe) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
