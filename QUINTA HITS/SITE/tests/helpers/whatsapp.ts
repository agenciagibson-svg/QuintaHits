import { createHmac } from "node:crypto";

/** Segredo FICTÍCIO só dos testes. */
export const SEGREDO_TESTE = "segredo-de-teste-nao-e-real";

export const assinar = (corpo: string, segredo = SEGREDO_TESTE) => `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;

export const ID_QUINTA_HITS = "1352142871312651";
/** ID fictício de OUTRO número da mesma conta (representa o final 0200). */
export const ID_OUTRO_NUMERO = "5550000000001";

type OpcoesMensagem = {
  phoneNumberId?: string | null;
  de?: string;
  wamid?: string;
  texto?: string;
  nome?: string;
  timestamp?: number;
  tipo?: string;
  interativo?: { id: string; titulo: string; lista?: boolean };
};

/** Corpo do webhook com UMA mensagem, no formato da WhatsApp Cloud API. */
export function corpoMensagem(o: OpcoesMensagem = {}): string {
  const de = o.de ?? "5534999998888";
  const tipo = o.tipo ?? (o.interativo ? "interactive" : "text");
  const mensagem: Record<string, unknown> = {
    from: de,
    id: o.wamid ?? `wamid.${Math.random().toString(36).slice(2)}`,
    timestamp: String(o.timestamp ?? Math.floor(Date.now() / 1000)),
    type: tipo,
  };
  if (tipo === "text") mensagem.text = { body: o.texto ?? "oi" };
  if (o.interativo) {
    mensagem.interactive = o.interativo.lista
      ? { type: "list_reply", list_reply: { id: o.interativo.id, title: o.interativo.titulo } }
      : { type: "button_reply", button_reply: { id: o.interativo.id, title: o.interativo.titulo } };
  }
  const metadata = o.phoneNumberId === null ? {} : { display_phone_number: "554000000000", phone_number_id: o.phoneNumberId ?? ID_QUINTA_HITS };
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata, contacts: [{ profile: { name: o.nome ?? "Cliente Teste" }, wa_id: de }], messages: [mensagem] } }] }],
  });
}

/** Corpo do webhook com uma atualização de status (entrega/leitura/falha). */
export function corpoStatus(o: { phoneNumberId?: string; wamid?: string; status?: string; erroCodigo?: number } = {}): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: o.phoneNumberId ?? ID_QUINTA_HITS }, statuses: [{ id: o.wamid ?? "wamid.saida1", status: o.status ?? "delivered", timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: "5534999998888", ...(o.erroCodigo ? { errors: [{ code: o.erroCodigo, title: "erro" }] } : {}) }] } }] }],
  });
}

/** POST assinado para a rota do webhook. */
export function requisicao(corpo: string, assinatura: string | null = assinar(corpo)): Request {
  return new Request("http://localhost/api/whatsapp/webhook", {
    method: "POST",
    headers: assinatura ? { "x-hub-signature-256": assinatura, "content-type": "application/json" } : { "content-type": "application/json" },
    body: corpo,
  });
}
