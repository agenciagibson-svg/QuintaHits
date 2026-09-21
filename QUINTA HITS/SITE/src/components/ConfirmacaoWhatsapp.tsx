"use client";

import { useEffect, useState } from "react";
import { formatData } from "@/lib/edicao";
import type { StatusReserva } from "@/lib/reserva";

export type PedidoEnviado = {
  id: string;
  mesa: string;
  data: string;
  codigo: string;
  expiraEm: string;
  whatsappLink: string;
};

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Último passo da reserva: o cliente manda o código pelo WhatsApp.
 * A tela consulta o status a cada poucos segundos e vira "confirmada" quando a mensagem chega.
 */
export default function ConfirmacaoWhatsapp({ pedido, onNovaReserva }: { pedido: PedidoEnviado; onNovaReserva: () => void }) {
  const [status, setStatus] = useState<StatusReserva>("aguardando");
  const [agora, setAgora] = useState(() => Date.now());
  const restante = new Date(pedido.expiraEm).getTime() - agora;

  useEffect(() => {
    if (status !== "aguardando") return;
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    const consulta = setInterval(async () => {
      try {
        const res = await fetch(`/api/reservas/${pedido.id}`, { cache: "no-store" });
        if (res.ok) setStatus((await res.json()).status);
      } catch {
        // sem conexão: tenta de novo no próximo ciclo
      }
    }, 4000);
    return () => {
      clearInterval(relogio);
      clearInterval(consulta);
    };
  }, [status, pedido.id]);

  // Prazo acabou na tela: mostra expirado sem esperar a próxima consulta.
  const statusVisivel: StatusReserva = status === "aguardando" && restante <= 0 ? "expirada" : status;

  if (statusVisivel === "confirmada") {
    return (
      <div className="placa placa--verde reserva__painel" role="status">
        <div className="eyebrow">Reserva confirmada</div>
        <h2 className="display h-2">Mesa {pedido.mesa} · {formatData(pedido.data, "numerica")}</h2>
        <p>Pronto! Sua mesa está garantida. A confirmação também chegou no seu WhatsApp.</p>
        <button type="button" className="btn btn--creme btn--p" onClick={onNovaReserva}>Fazer outra reserva</button>
      </div>
    );
  }

  if (statusVisivel !== "aguardando") {
    return (
      <div className="placa placa--preto reserva__painel" role="status">
        <div className="eyebrow">Prazo encerrado</div>
        <h2 className="display h-2">A mesa {pedido.mesa} foi liberada.</h2>
        <p>Não recebemos a mensagem de confirmação a tempo. Você pode escolher a mesa de novo.</p>
        <button type="button" className="btn btn--creme btn--p" onClick={onNovaReserva}>Reservar de novo</button>
      </div>
    );
  }

  return (
    <div className="placa placa--p placa--vazada reserva__painel reserva__confirmar" role="status" aria-live="polite">
      <div className="eyebrow">Falta 1 passo</div>
      <h2 className="display h-2">Confirme pelo WhatsApp</h2>
      <p>
        A mesa {pedido.mesa} está separada para você por <strong>{mmss(restante)}</strong>. Envie a mensagem com o código
        abaixo <strong>do mesmo número que você informou</strong> — a confirmação é automática.
      </p>
      <div className="reserva__codigo">{pedido.codigo}</div>
      <a className="btn btn--terracota" href={pedido.whatsappLink} target="_blank" rel="noopener noreferrer">
        Enviar pelo WhatsApp
      </a>
      <p className="reserva__aviso">Esta tela atualiza sozinha quando a mensagem chegar.</p>
    </div>
  );
}
