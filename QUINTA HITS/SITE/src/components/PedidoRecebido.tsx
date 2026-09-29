"use client";

import { formatData } from "@/lib/edicao";

export type PedidoManual = { mesa: string; data: string; codigo: string; nome: string };

/**
 * Modo formulário (WhatsApp ainda não conectado): o pedido chegou ao painel e a mesa fica separada
 * até a equipe responder. Nada acontece sozinho aqui: a equipe confirma e avisa o cliente pelo WhatsApp.
 */
export default function PedidoRecebido({ pedido, onNovaReserva }: { pedido: PedidoManual; onNovaReserva: () => void }) {
  const primeiroNome = pedido.nome.split(" ")[0];
  return (
    <div className="placa placa--verde reserva__painel" role="status" aria-live="polite">
      <div className="eyebrow">Pedido recebido</div>
      <h2 className="display h-2">Mesa {pedido.mesa} · {formatData(pedido.data, "numerica")}</h2>
      <p>
        Valeu, {primeiroNome}! A mesa está separada para você enquanto a nossa equipe confere o pedido.
        Você recebe a <strong>confirmação no WhatsApp</strong> que informou.
      </p>
      <p className="reserva__aviso">
        Código do pedido: <strong>{pedido.codigo}</strong>. Guarde para falar com a gente, se precisar.
      </p>
      <button type="button" className="btn btn--creme btn--p" onClick={onNovaReserva}>Fazer outro pedido</button>
    </div>
  );
}
