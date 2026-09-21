import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { agenteLigadoPorEnv, ambienteAtual, envioLigadoPorEnv, envioRealPermitidoPorEnv, idParaEnvio, registroLigadoPorEnv, repasseHumanoLigadoPorEnv, reservasSiteLigadoPorEnv } from "@/lib/agente/ambiente";
import { envioRealAtivoAgora } from "@/lib/agente/estadoEnvio";
import { obterConfig } from "@/lib/agente/repositorio";
import { estadoDasReservasDoSite } from "@/lib/reservasSite";
import { parte2Aplicada } from "@/lib/regras";

/**
 * Estado das integrações para o painel. NUNCA devolve valores de variáveis: só nomes e "ligada/desligada" ou
 * "configurada/ausente". Tokens, segredos, PINs e chaves não passam por aqui.
 */
export type EstadoIntegracoes = {
  ambiente_deploy: "producao" | "homologacao";
  chaves: { nome: string; descricao: string; ligada: boolean }[];
  credenciais: { nome: string; configurada: boolean }[];
  numero: { id_de_envio_confere: boolean };
  envio_real_liberado_agora: boolean;
  reservas_site: { aberto: boolean; motivo: string };
  banco: {
    migrado: boolean;
    parte2: boolean;
    ambiente: string | null;
    agente_ativo: boolean;
    envio_ativo: boolean;
    pausa_emergencia: boolean;
    restringir_a_numeros_teste: boolean;
    quantidade_de_numeros_teste: number;
    limpeza_ativa: boolean;
    politica_retencao_validada: boolean;
  };
};

const definida = (nome: string) => Boolean(process.env[nome]?.trim());

const CREDENCIAIS = [
  "WHATSAPP_NUMERO_CASA", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN",
  "TURNSTILE_SECRET_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_EMAILS", "ADMIN_SESSION_SECRET", "CRON_SECRET",
];

export async function estadoDasIntegracoes(): Promise<EstadoIntegracoes> {
  const config = await obterConfig().catch(() => null);
  const extra = config
    ? ((await supabaseAdmin().from("wa_config").select("limpeza_ativa, politica_retencao_validada_em").eq("id", 1).maybeSingle()).data as { limpeza_ativa: boolean; politica_retencao_validada_em: string | null } | null)
    : null;
  return {
    ambiente_deploy: ambienteAtual(),
    chaves: [
      { nome: "WHATSAPP_AGENT_ENABLED", descricao: "Agente de atendimento", ligada: agenteLigadoPorEnv() },
      { nome: "WHATSAPP_SEND_ENABLED", descricao: "Envio de mensagens (o envio real exige também o agente)", ligada: envioLigadoPorEnv() },
      { nome: "WHATSAPP_REGISTRATION_ENABLED", descricao: "Registro do número na Meta (só por script manual)", ligada: registroLigadoPorEnv() },
      { nome: "RESERVAS_SITE_ENABLED", descricao: "Reserva de mesa pelo site", ligada: reservasSiteLigadoPorEnv() },
      { nome: "WHATSAPP_HUMAN_HANDOFF_ENABLED", descricao: "Repasse para atendimento humano (padrão ligado)", ligada: repasseHumanoLigadoPorEnv() },
      { nome: "RETENCAO_ENABLED", descricao: "Limpeza real de dados antigos (sem ela só simula)", ligada: process.env.RETENCAO_ENABLED === "true" },
    ],
    credenciais: CREDENCIAIS.map((nome) => ({ nome, configurada: definida(nome) })),
    numero: { id_de_envio_confere: idParaEnvio() !== null },
    envio_real_liberado_agora: (await envioRealAtivoAgora()) && envioRealPermitidoPorEnv(),
    reservas_site: estadoDasReservasDoSite(),
    banco: {
      migrado: config !== null,
      parte2: config !== null ? await parte2Aplicada() : false,
      ambiente: config?.ambiente ?? null,
      agente_ativo: config?.agente_ativo ?? false,
      envio_ativo: config?.envio_ativo ?? false,
      pausa_emergencia: config?.pausa_emergencia ?? false,
      restringir_a_numeros_teste: config?.restringir_a_numeros_teste ?? true,
      quantidade_de_numeros_teste: config?.numeros_teste.length ?? 0,
      limpeza_ativa: extra?.limpeza_ativa ?? false,
      politica_retencao_validada: Boolean(extra?.politica_retencao_validada_em),
    },
  };
}
