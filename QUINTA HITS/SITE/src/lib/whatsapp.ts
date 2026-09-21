import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

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

/** Todas as variáveis que o fluxo de confirmação precisa (receber, conferir e responder). */
export function whatsappConfigurado(): boolean {
  return Boolean(
    numeroDaCasa() && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_APP_SECRET,
  );
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

/** Responde o cliente. Grátis dentro das 24h depois da mensagem dele (janela de atendimento). */
export async function enviarTexto(para: string, texto: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    console.error("WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID não definidos: resposta não enviada.");
    return;
  }
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { body: texto } }),
  });
  if (!res.ok) console.error("Falha ao enviar WhatsApp:", res.status, await res.text().catch(() => ""));
}

/** `enviadaEm`: quando o cliente mandou (ms), pelo relógio da Meta — não quando chegou aqui. */
export type MensagemRecebida = { de: string; texto: string; enviadaEm: number };

/** Extrai as mensagens de texto do payload do webhook (ignora status de entrega, mídia etc.). */
export function mensagensDoWebhook(payload: unknown): MensagemRecebida[] {
  const lista: MensagemRecebida[] = [];
  const entradas = (payload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entradas)) return lista;
  for (const entrada of entradas) {
    for (const mudanca of (entrada as { changes?: unknown[] })?.changes ?? []) {
      const mensagens = (mudanca as { value?: { messages?: unknown[] } })?.value?.messages ?? [];
      for (const m of mensagens as { from?: unknown; type?: unknown; timestamp?: unknown; text?: { body?: unknown } }[]) {
        if (m?.type === "text" && typeof m.from === "string" && typeof m.text?.body === "string") {
          const segundos = Number(m.timestamp);
          lista.push({ de: m.from, texto: m.text.body, enviadaEm: Number.isFinite(segundos) ? segundos * 1000 : Date.now() });
        }
      }
    }
  }
  return lista;
}
