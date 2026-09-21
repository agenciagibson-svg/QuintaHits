"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { EstadoIntegracoes } from "@/lib/integracoes";
import { s } from "./estilos";

const MOTIVO_SITE: Record<string, string> = {
  chave_desligada: "fechada: RESERVAS_SITE_ENABLED desligada",
  whatsapp_nao_configurado: "fechada: a confirmação pelo WhatsApp ainda não pode ser enviada (credenciais e chaves de envio)",
  ok: "aberta",
};

const selo = (ligado: boolean, textoLigado: string, textoDesligado: string) => (
  <span style={{ ...s.selo, background: ligado ? "#17352B" : "#333", color: ligado ? "#9be7b8" : "#F1E7D2" }}>{ligado ? textoLigado : textoDesligado}</span>
);

/** Estado das integrações e das chaves de segurança. Somente leitura, sem nenhum valor secreto: só nomes e ligada/desligada, configurada/ausente. */
export default function IntegracoesPainel() {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoIntegracoes | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/integracoes");
      if (res.status === 401) return router.replace("/admin/login");
      if (!res.ok) throw new Error();
      setEstado(await res.json());
      setErro("");
    } catch {
      setErro("Não foi possível carregar o estado das integrações.");
    }
  }, [router]);

  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <div style={{ ...s.avisoErro, marginInline: 0 }}>{erro}</div>;
  if (!estado) return <p style={s.legenda}>Carregando…</p>;
  const b = estado.banco;

  return (
    <div>
      <p style={s.legenda}>
        Somente leitura. As chaves são variáveis de ambiente da Vercel (mudar exige novo deploy) e nada aqui mostra valores de tokens, segredos ou PINs.
        Ter credenciais preenchidas <strong>não liga nada</strong>: cada funcionalidade tem a sua chave, e só o texto exato <code>true</code> liga.
      </p>
      <div style={s.gridNova}>
        <div style={s.cartao}>
          <strong>Estado geral</strong>
          <p style={s.legenda}>
            Ambiente do deploy: <strong>{estado.ambiente_deploy}</strong> · Banco: <strong>{b.ambiente ?? "sem a migração"}</strong>
            {b.ambiente && b.ambiente !== estado.ambiente_deploy ? " (divergem: o agente fica travado)" : ""}
          </p>
          <p style={s.legenda}>Envio real pela Meta agora: {selo(estado.envio_real_liberado_agora, "LIBERADO", "BLOQUEADO")}</p>
          <p style={s.legenda}>Reserva pelo site: <strong>{MOTIVO_SITE[estado.reservas_site.motivo] ?? estado.reservas_site.motivo}</strong></p>
          <p style={s.legenda}>Phone Number ID de envio confere com o da QUINTA HITS: {selo(estado.numero.id_de_envio_confere, "sim", "não / ausente")}</p>
        </div>
        <div style={s.cartao}>
          <strong>Banco (configuração do agente)</strong>
          <p style={s.legenda}>Migração parte 1: {selo(b.migrado, "aplicada", "não aplicada")} · parte 2: {selo(b.parte2, "aplicada", "não aplicada")}</p>
          <p style={s.legenda}>Agente: {selo(b.agente_ativo, "ativo", "desligado")} · Envio: {selo(b.envio_ativo, "ativo", "desligado")}</p>
          <p style={s.legenda}>Pausa de emergência: {selo(b.pausa_emergencia, "ATIVA", "desativada")}</p>
          <p style={s.legenda}>Restrito a números de teste: {selo(b.restringir_a_numeros_teste, "sim", "não")} ({b.quantidade_de_numeros_teste} número(s))</p>
          <p style={s.legenda}>Limpeza de retenção: {selo(b.limpeza_ativa, "ativa", "desligada")} · política validada: {selo(b.politica_retencao_validada, "sim", "não")}</p>
        </div>
      </div>

      <h3 style={{ ...s.h2, marginTop: 16 }}>Chaves de segurança</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={s.tabela}>
          <thead><tr><th style={s.th}>Variável</th><th style={s.th}>Para quê</th><th style={s.th}>Estado</th></tr></thead>
          <tbody>
            {estado.chaves.map((c) => (
              <tr key={c.nome}><td style={s.td}><code>{c.nome}</code></td><td style={s.td}>{c.descricao}</td><td style={s.td}>{selo(c.ligada, "LIGADA", "desligada")}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ ...s.h2, marginTop: 16 }}>Credenciais e variáveis (só se existem)</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={s.tabela}>
          <thead><tr><th style={s.th}>Variável</th><th style={s.th}>Estado</th></tr></thead>
          <tbody>
            {estado.credenciais.map((c) => (
              <tr key={c.nome}><td style={s.td}><code>{c.nome}</code></td><td style={s.td}>{selo(c.configurada, "configurada", "ausente")}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
