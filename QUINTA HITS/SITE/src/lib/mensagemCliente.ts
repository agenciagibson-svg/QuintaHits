import { formatData } from "@/lib/edicao";
import type { StatusReserva } from "@/lib/reserva";
import { CASAS, CASA_PADRAO, ehCasa } from "@/config/casas";

/**
 * Link do WhatsApp NORMAL (wa.me) com a mensagem pronta para o cliente de uma reserva — usado pelo painel e pelo app
 * da casa. Abre o WhatsApp de quem clicou; não depende da Meta nem envia nada sozinho.
 */
export function linkWhatsappCliente(
  r: { nome: string; whatsapp: string; pessoas: number; status: StatusReserva; codigo: string | null },
  edicao: { data: string; horario?: string; local?: string; casa?: string } | undefined,
  mesa: string,
): string {
  const casa = CASAS[ehCasa(edicao?.casa) ? edicao.casa : CASA_PADRAO];
  const quinta = casa.id === CASA_PADRAO;
  const primeiroNome = r.nome.trim().split(/\s+/)[0] || r.nome;
  const data = edicao ? formatData(edicao.data, "numerica") : "";
  const hora = edicao?.horario ? `, a partir das ${edicao.horario}` : "";
  // Na Quinta Hits o local muda (Florindos Bar); nas outras casas o local é a própria casa, já citada na mensagem.
  const local = quinta && edicao?.local ? ` no ${edicao.local}` : "";
  const quando = `dia ${data}`;
  const texto =
    r.status === "confirmada"
      ? `Olá, ${primeiroNome}! Sua reserva ${casa.naCasa} está confirmada: mesa ${mesa} para ${r.pessoas} pessoa(s), ${quando}${hora}${local}.${r.codigo ? ` Código ${r.codigo}.` : ""} Te esperamos!`
      : r.status === "cancelada" || r.status === "expirada"
        ? `Olá, ${primeiroNome}! Infelizmente não conseguimos confirmar a mesa ${mesa} ${casa.naCasa} de ${data}. Se quiser, responda aqui que a gente te ajuda com outra opção.`
        : `Olá, ${primeiroNome}! Recebemos seu pedido da mesa ${mesa} ${casa.naCasa} de ${data}.`;
  return `https://wa.me/55${r.whatsapp}?text=${encodeURIComponent(texto)}`;
}
