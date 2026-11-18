"use client";

import { useEffect, useState } from "react";
import { formatData, hojeISO, type Edicao } from "@/lib/edicao";
import { formatarWhatsapp } from "@/lib/reserva";
import { cor, s, selo } from "./estilos";

type IngressoAdmin = {
  id: string;
  nome: string;
  whatsapp: string;
  quantidade: number;
  valor_unitario_centavos: number;
  codigo: string;
  status: "confirmado" | "cancelado";
  chegou_em: string | null;
  created_at: string;
};

const reais = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

function edicaoPadrao(edicoes: Edicao[]): string {
  const hoje = hojeISO();
  const futuras = edicoes.filter((e) => e.data >= hoje && e.status !== "cancelada");
  return (futuras[futuras.length - 1] ?? edicoes[0])?.id ?? "";
}

/** Ingressos individuais (sem mesa) da noite: separados das mesas. Valor do ingresso, lista, totais e cancelamento. */
export default function IngressosPainel({ edicoes }: { edicoes: Edicao[] }) {
  const [edicaoId, setEdicaoId] = useState(() => edicaoPadrao(edicoes));
  const [lista, setLista] = useState<IngressoAdmin[]>([]);
  const [valor, setValor] = useState<number | null>(null);
  const [valorTexto, setValorTexto] = useState("");
  const [capacidade, setCapacidade] = useState<number | null>(null);
  const [migrado, setMigrado] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  async function carregar(id: string) {
    if (!id) return;
    setErro("");
    const res = await fetch(`/api/admin/ingressos?edicao=${encodeURIComponent(id)}`, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setErro(j.erro || "Não foi possível carregar os ingressos.");
    setMigrado(j.migrado !== false);
    setLista(j.ingressos ?? []);
    setValor(j.valor_centavos ?? null);
    setValorTexto(j.valor_centavos === null || j.valor_centavos === undefined ? "" : (j.valor_centavos / 100).toFixed(2).replace(".", ","));
    setCapacidade(j.capacidade ?? null);
  }

  useEffect(() => {
    carregar(edicaoId);
  }, [edicaoId]);

  async function salvarValor() {
    setErro("");
    setAviso("");
    const limpo = valorTexto.trim().replace(/\./g, "").replace(",", ".");
    const centavos = limpo === "" ? null : Math.round(Number(limpo) * 100);
    if (centavos !== null && !(Number.isFinite(centavos) && centavos >= 0)) return setErro("Valor inválido.");
    const res = await fetch("/api/admin/ingressos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edicao: edicaoId, valor_centavos: centavos }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setErro(j.erro || "Não foi possível salvar.");
    setAviso(centavos === null ? "Esta noite não vende mais ingresso pelo site." : `Ingresso a ${reais(centavos)} por pessoa.`);
    carregar(edicaoId);
  }

  async function mudarStatus(i: IngressoAdmin, status: "cancelado" | "confirmado") {
    if (status === "cancelado" && !window.confirm(`Cancelar ${i.quantidade} ingresso(s) de ${i.nome} (${i.codigo})?`)) return;
    const res = await fetch("/api/admin/ingressos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: i.id, status }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setErro(j.erro || "Não foi possível mudar o ingresso.");
    carregar(edicaoId);
  }

  const ativos = lista.filter((i) => i.status === "confirmado");
  const vendidos = ativos.reduce((t, i) => t + i.quantidade, 0);
  const entraram = ativos.filter((i) => i.chegou_em).reduce((t, i) => t + i.quantidade, 0);
  const receber = ativos.reduce((t, i) => t + i.quantidade * i.valor_unitario_centavos, 0);

  return (
    <div style={s.secao}>
      <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>Ingressos individuais</h2>
      <p style={s.legenda}>Sem mesa, pagos na portaria. Saem confirmados na hora, com QR de entrada. A venda para quando ingressos + pessoas das mesas chegam à capacidade máxima da noite{capacidade ? ` (${capacidade})` : ""}.</p>
      {!migrado && <div style={s.avisoErro}>Falta rodar a migração de ingressos (supabase/migracao-2026-11-17-ingressos.sql).</div>}
      {erro && <div style={s.avisoErro}>{erro}</div>}
      {aviso && <div style={s.aviso}>{aviso}</div>}
      <div style={s.gridConfig}>
        <label style={s.campo}>
          Noite
          <select style={s.input} value={edicaoId} onChange={(e) => setEdicaoId(e.target.value)}>
            {edicoes.map((e) => (
              <option key={e.id} value={e.id}>
                {formatData(e.data, "numerica")} · {e.artista || "sem atração"}
              </option>
            ))}
          </select>
        </label>
        <label style={s.campo}>
          Valor do ingresso (R$) — vazio = não vende
          <input style={s.input} value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} inputMode="decimal" placeholder="25,00" />
        </label>
        <button type="button" style={{ ...s.botaoSalvar, gridColumn: "auto" }} onClick={salvarValor}>
          Salvar valor
        </button>
      </div>
      <p style={{ ...s.legenda, marginTop: 16 }}>
        {valor === null ? "Esta noite não vende ingresso pelo site." : `${vendidos} ingresso${vendidos === 1 ? "" : "s"} vendido${vendidos === 1 ? "" : "s"} · ${entraram} já entraram · ${reais(receber)} a receber na portaria`}
      </p>
      {lista.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={s.tabela}>
            <thead>
              <tr>
                <th style={s.th}>Código</th>
                <th style={s.th}>Nome</th>
                <th style={s.th}>WhatsApp</th>
                <th style={s.th}>Qtd.</th>
                <th style={s.th}>Total</th>
                <th style={s.th}>Situação</th>
                <th style={s.th} />
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id} style={i.status === "cancelado" ? { opacity: 0.5 } : undefined}>
                  <td style={s.td}>{i.codigo}</td>
                  <td style={s.td}>{i.nome}</td>
                  <td style={s.td}>{formatarWhatsapp(i.whatsapp)}</td>
                  <td style={s.td}>{i.quantidade}</td>
                  <td style={s.td}>{reais(i.quantidade * i.valor_unitario_centavos)}</td>
                  <td style={s.td}>
                    <span style={selo(i.status === "cancelado" ? "neutro" : i.chegou_em ? "ok" : "alerta")}>
                      {i.status === "cancelado" ? "Cancelado" : i.chegou_em ? `Entrou ${hora(i.chegou_em)}` : "Confirmado"}
                    </span>
                  </td>
                  <td style={s.td}>
                    {i.status === "confirmado" ? (
                      !i.chegou_em && (
                        <button type="button" style={s.botaoMiniPerigo} onClick={() => mudarStatus(i, "cancelado")}>
                          Cancelar
                        </button>
                      )
                    ) : (
                      <button type="button" style={s.botaoMiniOutline} onClick={() => mudarStatus(i, "confirmado")}>
                        Reativar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ ...s.legenda, color: cor.suave, marginTop: 12, marginBottom: 0 }}>O QR do ingresso é lido na mesma tela de check-in das mesas (app da casa).</p>
    </div>
  );
}
