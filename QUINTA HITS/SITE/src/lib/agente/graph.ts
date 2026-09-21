import type { Mensagem } from "./tipos";

/** Montagem do corpo da WhatsApp Cloud API e política de reenvio. Sem rede e sem banco. */

/** Corpo JSON de `POST /{phone_number_id}/messages` para uma mensagem do agente. */
export function montarPayloadGraph(para: string, m: Mensagem): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: para };
  if (m.tipo === "texto") return { ...base, type: "text", text: { body: m.corpo, preview_url: false } };
  if (m.tipo === "botoes") {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: m.corpo },
        action: { buttons: m.botoes.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.titulo.slice(0, 20) } })) },
      },
    };
  }
  return {
    ...base,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: m.corpo },
      action: {
        button: m.rotuloBotao.slice(0, 20),
        sections: [{ title: "Opções", rows: m.itens.slice(0, 10).map((i) => ({ id: i.id, title: i.titulo.slice(0, 24), ...(i.descricao ? { description: i.descricao.slice(0, 72) } : {}) })) }],
      },
    },
  };
}

/** Texto legível da mensagem (o que o atendente vê no histórico). */
export function textoDaMensagem(m: Mensagem): string {
  if (m.tipo === "texto") return m.corpo;
  if (m.tipo === "botoes") return `${m.corpo}\n[${m.botoes.map((b) => b.titulo).join(" | ")}]`;
  return `${m.corpo}\n[${m.itens.map((i) => i.titulo).join(" | ")}]`;
}

/** Espera antes da próxima tentativa: 30 s, 60 s, 2 min, 4 min... até 1 h; respeita o "retry-after" da Meta. */
export function atrasoDeReenvioSegundos(tentativaJaFeita: number, retryAfterS?: number): number {
  const exponencial = Math.min(30 * 2 ** Math.max(0, tentativaJaFeita - 1), 3600);
  return Math.max(exponencial, retryAfterS ?? 0);
}

/** Falha temporária (vale tentar de novo) ou definitiva? 429, 5xx e falha de rede são temporárias. */
export const falhaTemporaria = (httpStatus: number): boolean => httpStatus === 0 || httpStatus === 429 || httpStatus >= 500;

/** Remove do texto de erro o que não pode ser guardado: tokens e telefones. */
export function sanitizarErro(texto: string | undefined | null): string {
  return (texto ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [removido]")
    .replace(/EAA[A-Za-z0-9]{10,}/g, "[token removido]")
    .replace(/\b\d{10,15}\b/g, "[número removido]")
    .slice(0, 300);
}

/** A conversa ainda está dentro da janela de 24 h desde a última mensagem do cliente? */
export function dentroDaJanela(ultimaMsgClienteEm: string | null, agora: Date): boolean {
  return !!ultimaMsgClienteEm && agora.getTime() - new Date(ultimaMsgClienteEm).getTime() <= 24 * 3_600_000;
}
