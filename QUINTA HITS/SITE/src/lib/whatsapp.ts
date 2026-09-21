import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { envioRealPermitidoPorEnv, idParaEnvio, versaoGraphApi } from "@/lib/agente/ambiente";

/**
 * WhatsApp Cloud API (oficial da Meta).
 * WHATSAPP_NUMERO_CASA     número que recebe as confirmações, só dígitos com 55 (ex.: 5534999998888)
 * WHATSAPP_PHONE_NUMBER_ID id desse número no painel da Meta
 * WHATSAPP_TOKEN           token de acesso permanente (usuário do sistema)
 * WHATSAPP_APP_SECRET      chave secreta do app — confere que o webhook veio mesmo da Meta
 * WHATSAPP_VERIFY_TOKEN    texto livre combinado com a Meta na hora de cadastrar o webhook
 */

export function numeroDaCasa(): string | null {
  const n = (process.env.WHATSAPP_NUMERO_CASA ?? "").replace(/\D/g, "");
  return n.length >= 12 ? n : null;
}

/**
 * Tudo o que o fluxo de confirmação precisa (receber, conferir e RESPONDER). Inclui o envio ligado e o número certo:
 * sem isso o site aceitaria reservas e o cliente nunca receberia a confirmação (a reserva ficaria presa até expirar).
 */
export function whatsappConfigurado(): boolean {
  return Boolean(numeroDaCasa() && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_APP_SECRET && envioRealPermitidoPorEnv() && idParaEnvio());
}

/** A assinatura X-Hub-Signature-256 bate com o corpo recebido? */
export function assinaturaValida(corpo: string, assinatura: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    console.error("WHATSAPP_APP_SECRET não definida: webhook do WhatsApp recusando todas as mensagens.");
    return false;
  }
  if (!assinatura?.startsWith("sha256=")) return false;
  const esperada = Buffer.from(createHmac("sha256", secret).update(corpo).digest("hex"));
  const recebida = Buffer.from(assinatura.slice("sha256=".length));
  return esperada.length === recebida.length && timingSafeEqual(esperada, recebida);
}

/**
 * Responde o cliente. Grátis dentro das 24h depois da mensagem dele (janela de atendimento).
 *
 * Só envia com WHATSAPP_AGENT_ENABLED=true E WHATSAPP_SEND_ENABLED=true (desligados por padrão) e só pelo número da QUINTA HITS: se
 * WHATSAPP_PHONE_NUMBER_ID apontar para outro número (ex.: o final 0200), não envia nada.
 */
export async function enviarTexto(para: string, texto: string): Promise<void> {
  if (!envioRealPermitidoPorEnv()) {
    console.info("Envio real desligado (exige WHATSAPP_AGENT_ENABLED e WHATSAPP_SEND_ENABLED): resposta não enviada.");
    return;
  }
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = idParaEnvio();
  if (!token || !phoneId) {
    console.error("WHATSAPP_TOKEN ausente ou WHATSAPP_PHONE_NUMBER_ID diferente do número da QUINTA HITS: resposta não enviada.");
    return;
  }
  const res = await fetch(`https://graph.facebook.com/${versaoGraphApi()}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { body: texto } }),
  });
  if (!res.ok) console.error("Falha ao enviar WhatsApp:", res.status, await res.text().catch(() => ""));
}

/** `enviadaEm`: quando o cliente mandou (ms), pelo relógio da Meta — não quando chegou aqui. */
export type MensagemRecebida = { de: string; texto: string; enviadaEm: number };
