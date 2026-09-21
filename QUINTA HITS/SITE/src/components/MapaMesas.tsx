"use client";

import type { PointerEvent, Ref } from "react";
import type { MesaPublica } from "@/lib/reserva";

export type EstadoMesa = "livre" | "ocupada" | "selecionada" | "inativa";

/** Mesa maior no mapa conforme os lugares, em % da largura do mapa. */
function tamanho(lugares: number): number {
  if (lugares <= 2) return 7;
  if (lugares <= 4) return 9;
  if (lugares <= 6) return 11;
  return 13;
}

const ROTULO: Record<EstadoMesa, string> = {
  livre: "livre",
  ocupada: "ocupada",
  selecionada: "selecionada",
  inativa: "desativada",
};

/**
 * Desenho do salão: cada mesa é um botão posicionado em % (x/y = centro).
 * Usado no site (cliente escolhe) e no painel (equipe arrasta para posicionar).
 */
export default function MapaMesas({
  mesas,
  estado,
  onEscolher,
  onPointerDownMesa,
  refMapa,
  desativarOcupadas = true,
}: {
  mesas: MesaPublica[];
  estado: (mesa: MesaPublica) => EstadoMesa;
  onEscolher?: (mesa: MesaPublica) => void;
  onPointerDownMesa?: (e: PointerEvent<HTMLButtonElement>, mesa: MesaPublica) => void;
  refMapa?: Ref<HTMLDivElement>;
  desativarOcupadas?: boolean;
}) {
  return (
    <div className={onPointerDownMesa ? "mapa mapa--editavel" : "mapa"} ref={refMapa}>
      {mesas.map((m) => {
        const est = estado(m);
        return (
          <button
            key={m.id}
            type="button"
            className={`mapa__mesa mapa__mesa--${est}`}
            style={{ left: `${m.x}%`, top: `${m.y}%`, ["--t" as string]: tamanho(m.lugares) }}
            disabled={desativarOcupadas && (est === "ocupada" || est === "inativa")}
            aria-pressed={est === "selecionada"}
            aria-label={`Mesa ${m.numero}, ${m.lugares} lugares${m.area ? `, ${m.area}` : ""} — ${ROTULO[est]}`}
            onClick={onEscolher ? () => onEscolher(m) : undefined}
            onPointerDown={onPointerDownMesa ? (e) => onPointerDownMesa(e, m) : undefined}
          >
            <span className="mapa__num">{m.numero}</span>
            <span className="mapa__lug">{m.lugares}p</span>
          </button>
        );
      })}
    </div>
  );
}
