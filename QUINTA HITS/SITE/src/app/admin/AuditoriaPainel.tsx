"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { s } from "./estilos";

type Item = { id: number; ator: string; acao: string; entidade: string; entidade_id: string | null; detalhe: Record<string, unknown>; criado_em: string };

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

  if (erro) return <div style={{ ...s.avisoErro, marginInline: 0 }}>{erro}</div>;
  if (!migrado) return <p style={s.legenda}>A auditoria depende da migração do agente, ainda não aplicada neste banco.</p>;
  return (
    <div>
      <button type="button" style={s.botaoMiniOutline} onClick={carregar}>Atualizar</button>
      {itens.length === 0 ? (
        <p style={s.legenda}>Nenhuma ação registrada ainda.</p>
      ) : (
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table style={s.tabela}>
            <thead><tr><th style={s.th}>Quando</th><th style={s.th}>Quem</th><th style={s.th}>Ação</th><th style={s.th}>Sobre</th><th style={s.th}>Detalhe</th></tr></thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id}>
                  <td style={s.td}>{quando(i.criado_em)}</td>
                  <td style={s.td}>{i.ator}</td>
                  <td style={s.td}>{i.acao}</td>
                  <td style={s.td}>{i.entidade}{i.entidade_id ? ` ${i.entidade_id.slice(0, 8)}` : ""}</td>
                  <td style={s.td}><small>{Object.keys(i.detalhe ?? {}).length ? JSON.stringify(i.detalhe) : "—"}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
