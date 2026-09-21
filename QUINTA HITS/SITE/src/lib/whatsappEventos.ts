/**
 * Leitura do corpo do webhook da WhatsApp Cloud API — sem acesso a banco ou rede.
 * Cada evento carrega o `phone_number_id` do número que o recebeu: é ele que separa a QUINTA HITS dos demais números
 * da conta (ex.: o final 0200), porque o callback é único por aplicativo.
 */

export type ConteudoMensagem =
  | { forma: "texto"; texto: string }
  /** Toque em botão ou item de lista de uma mensagem interativa que enviamos. */
  | { forma: "resposta_interativa"; id: string; titulo: string }
  /** Imagem, áudio, figurinha, localização, documento, reação etc. */
  | { forma: "nao_suportado"; tipoMeta: string };

export type EventoMensagem = {
  tipo: "mensagem";
  phoneNumberId: string | null;
  wamid: string;
  /** wa_id do cliente, como a Meta entrega (só dígitos, com país). */
  de: string;
  nomePerfil: string | null;
  /** Quando o cliente enviou (ms), pelo relógio da Meta. */
  enviadaEm: number;
  conteudo: ConteudoMensagem;
};

export type EventoStatus = {
  tipo: "status";
  phoneNumberId: string | null;
  wamid: string;
  status: string;
  erroCodigo: string | null;
  em: number;
};

export type EventoWhatsapp = EventoMensagem | EventoStatus;

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const segundosParaMs = (v: unknown, padrao: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n * 1000 : padrao;
};

function lerConteudo(m: Record<string, unknown>): ConteudoMensagem {
  const tipo = texto(m.type) ?? "desconhecido";
  if (tipo === "text" && ehObjeto(m.text) && typeof m.text.body === "string") return { forma: "texto", texto: m.text.body };
  if (tipo === "interactive" && ehObjeto(m.interactive)) {
    const i = m.interactive;
    const resposta = ehObjeto(i.button_reply) ? i.button_reply : ehObjeto(i.list_reply) ? i.list_reply : null;
    if (resposta && texto(resposta.id)) return { forma: "resposta_interativa", id: String(resposta.id), titulo: texto(resposta.title) ?? "" };
  }
  if (tipo === "button" && ehObjeto(m.button)) {
    const id = texto(m.button.payload) ?? texto(m.button.text);
    if (id) return { forma: "resposta_interativa", id, titulo: texto(m.button.text) ?? id };
  }
  return { forma: "nao_suportado", tipoMeta: tipo };
}

/** Extrai mensagens e atualizações de status do payload; ignora com segurança o que não entender. */
export function extrairEventos(payload: unknown, agora = Date.now()): EventoWhatsapp[] {
  const eventos: EventoWhatsapp[] = [];
  if (!ehObjeto(payload)) return eventos;

  for (const entrada of lista(payload.entry)) {
    if (!ehObjeto(entrada)) continue;
    for (const mudanca of lista(entrada.changes)) {
      if (!ehObjeto(mudanca) || !ehObjeto(mudanca.value)) continue;
      const valor = mudanca.value;
      const phoneNumberId = ehObjeto(valor.metadata) ? texto(valor.metadata.phone_number_id) : null;

      const nomes = new Map<string, string>();
      for (const c of lista(valor.contacts)) {
        if (ehObjeto(c) && texto(c.wa_id) && ehObjeto(c.profile) && texto(c.profile.name)) nomes.set(String(c.wa_id), String(c.profile.name));
      }

      for (const m of lista(valor.messages)) {
        if (!ehObjeto(m) || !texto(m.from)) continue;
        const de = String(m.from);
        eventos.push({
          tipo: "mensagem",
          phoneNumberId,
          wamid: texto(m.id) ?? "",
          de,
          nomePerfil: nomes.get(de) ?? null,
          enviadaEm: segundosParaMs(m.timestamp, agora),
          conteudo: lerConteudo(m),
        });
      }

      for (const st of lista(valor.statuses)) {
        if (!ehObjeto(st) || !texto(st.id) || !texto(st.status)) continue;
        const erro = lista(st.errors).find(ehObjeto);
        eventos.push({
          tipo: "status",
          phoneNumberId,
          wamid: String(st.id),
          status: String(st.status),
          erroCodigo: erro && erro.code !== undefined ? String(erro.code) : null,
          em: segundosParaMs(st.timestamp, agora),
        });
      }
    }
  }
  return eventos;
}
