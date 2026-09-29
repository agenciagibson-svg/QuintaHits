"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { EstadoIntegracoes } from "@/lib/integracoes";
import { cor, s, selo, type Tom } from "./estilos";

const MOTIVO_SITE: Record<string, string> = {
  chave_desligada: "A chave RESERVAS_SITE_ENABLED está desligada na Vercel.",
  whatsapp_nao_configurado: "A confirmação pelo WhatsApp ainda não pode ser enviada (credenciais e chaves de envio).",
  ok: "O público já pode reservar pelo site (confirmação automática pelo WhatsApp).",
  manual: "Modo formulário: o pedido chega em Reservas e a equipe confirma e avisa pelo WhatsApp da casa.",
};

const nomeAmbiente = (a: string | null) => (a === "producao" ? "produção" : a === "homologacao" ? "homologação" : a ?? "sem migração");

type Cartao = { titulo: string; estado: string; tom: Tom; texto: string };

const pilula = (ligado: boolean, sim: string, nao: string, tomSim: Tom = "ok", tomNao: Tom = "neutro") => <span style={selo(ligado ? tomSim : tomNao)}>{ligado ? sim : nao}</span>;

/** Estado das integrações. Primeiro um resumo em linguagem simples; os detalhes técnicos ficam recolhidos. Nunca mostra valores secretos. */
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

  if (erro) return <div style={s.avisoErro}>{erro}</div>;
  if (!estado) return <p style={s.legenda}>Carregando…</p>;
  const b = estado.banco;
  const ambientesDivergem = !!b.ambiente && b.ambiente !== estado.ambiente_deploy;

  const cartoes: Cartao[] = [
    {
      titulo: "Banco de dados",
      estado: b.migrado && b.parte2 ? "Atualizado" : "Migração pendente",
      tom: b.migrado && b.parte2 ? "ok" : "alerta",
      texto: b.migrado && b.parte2 ? "Migrações parte 1 e parte 2 aplicadas." : "Aplique a migração pendente no SQL Editor do Supabase.",
    },
    {
      titulo: "WhatsApp",
      estado: b.pausa_emergencia ? "Pausa de emergência" : estado.envio_real_liberado_agora ? "Conectado" : "Modo simulado",
      tom: b.pausa_emergencia ? "perigo" : estado.envio_real_liberado_agora ? "ok" : "alerta",
      texto: estado.envio_real_liberado_agora
        ? "Agente e envio de mensagens ligados."
        : "Nenhuma mensagem sai para o cliente. Falta a aprovação da Meta, as credenciais e ligar as chaves.",
    },
    {
      titulo: "Reservas pelo site",
      estado: estado.reservas_site.aberto ? (estado.reservas_site.motivo === "manual" ? "Abertas (formulário)" : "Abertas") : "Fechadas",
      tom: estado.reservas_site.aberto ? "ok" : "neutro",
      texto: MOTIVO_SITE[estado.reservas_site.motivo] ?? estado.reservas_site.motivo,
    },
    {
      titulo: "Limpeza de dados antigos",
      estado: b.limpeza_ativa ? "Ativa" : "Desligada",
      tom: b.limpeza_ativa ? "ok" : "neutro",
      texto: b.politica_retencao_validada ? "Política de retenção validada." : "Política de retenção ainda não validada.",
    },
  ];

  return (
    <div>
      <div className="qh-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
        {cartoes.map((c) => (
          <div key={c.titulo} className="qh-kpi">
            <span className="qh-kpi-rotulo">{c.titulo}</span>
            <span><span style={{ ...selo(c.tom), fontSize: 13 }}>{c.estado}</span></span>
            <span className="qh-kpi-sub">{c.texto}</span>
          </div>
        ))}
      </div>

      <section style={s.secao}>
        <details className="qh-detalhes">
          <summary>Detalhes técnicos (chaves, credenciais e configuração do agente)</summary>
          <p style={{ ...s.legenda, marginTop: 10 }}>
            Somente leitura. As chaves são variáveis de ambiente da Vercel (mudar exige novo deploy). Nenhum valor de token, segredo ou PIN aparece aqui.
            Ter credenciais preenchidas <strong>não liga nada</strong>: só o texto exato <code>true</code> liga cada chave.
          </p>

          <h3 style={s.h3}>Ambiente e agente</h3>
          {ambientesDivergem && (
            <p style={{ ...s.legenda, marginTop: 10 }}>
              O site está em <strong>{nomeAmbiente(estado.ambiente_deploy)}</strong> e o banco em <strong>{nomeAmbiente(b.ambiente)}</strong>. Enquanto forem diferentes, o agente do WhatsApp fica travado de propósito (esperado até o piloto).
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span style={selo("neutro")}>Site: {nomeAmbiente(estado.ambiente_deploy)}</span>
            <span style={selo(ambientesDivergem ? "alerta" : "neutro")}>Banco: {nomeAmbiente(b.ambiente)}</span>
            {pilula(b.agente_ativo, "Agente ativo", "Agente desligado")}
            {pilula(b.envio_ativo, "Envio ativo", "Envio desligado")}
            {pilula(estado.numero.id_de_envio_confere, "Número confere", "Número ausente", "ok", "neutro")}
            {pilula(b.restringir_a_numeros_teste, `Só números de teste (${b.quantidade_de_numeros_teste})`, "Aberto a todos", "alerta", "ok")}
          </div>

          <h3 style={s.h3}>Chaves de segurança</h3>
          <table style={s.tabela}>
            <tbody>
              {estado.chaves.map((c) => (
                <tr key={c.nome}>
                  <td style={s.td}><code style={{ fontSize: 12 }}>{c.nome}</code><div style={{ fontSize: 12, color: cor.suave }}>{c.descricao}</div></td>
                  <td style={{ ...s.td, textAlign: "right" }}>{pilula(c.ligada, "Ligada", "Desligada")}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={s.h3}>Credenciais (só se existem)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 6 }}>
            {estado.credenciais.map((c) => (
              <div key={c.nome} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: "rgba(241,231,210,0.03)" }}>
                <code style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>{c.nome}</code>
                {pilula(c.configurada, "ok", "ausente")}
              </div>
            ))}
          </div>
        </details>
      </section>
    </div>
  );
}
