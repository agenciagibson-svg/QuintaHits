"use client";

import type { PointerEvent, Ref } from "react";
import type { MesaPublica } from "@/lib/reserva";
import { TIPOS_ELEMENTO, type ElementoSalao } from "@/lib/planta";

export type EstadoMesa = "livre" | "ocupada" | "selecionada" | "inativa";

/** Tamanho da mesa (tampo + cadeiras) em % da largura do mapa, conforme os lugares. */
function tamanho(lugares: number): number {
  if (lugares <= 2) return 8;
  if (lugares <= 4) return 10;
  if (lugares <= 6) return 12;
  return 14;
}

const ROTULO: Record<EstadoMesa, string> = {
  livre: "livre",
  ocupada: "ocupada",
  selecionada: "sua escolha",
  inativa: "desativada",
};

/**
 * Planta do salão: elementos fixos (palco, bar, entrada...) ao fundo e as mesas por cima, cada uma um botão
 * posicionado em % (x/y = centro) com tampo e cadeiras conforme os lugares.
 * Usado no site (cliente escolhe) e no painel (equipe arrasta mesas e elementos para posicionar).
 */
export default function MapaMesas({
  mesas,
  estado,
  onEscolher,
  onPointerDownMesa,
  refMapa,
  desativarOcupadas = true,
  elementos = [],
  elementoSelecionado,
  onPointerDownElemento,
}: {
  mesas: MesaPublica[];
  estado: (mesa: MesaPublica) => EstadoMesa;
  onEscolher?: (mesa: MesaPublica) => void;
  onPointerDownMesa?: (e: PointerEvent<HTMLButtonElement>, mesa: MesaPublica) => void;
  refMapa?: Ref<HTMLDivElement>;
  desativarOcupadas?: boolean;
  elementos?: ElementoSalao[];
  elementoSelecionado?: string | null;
  onPointerDownElemento?: (e: PointerEvent<HTMLDivElement>, elemento: ElementoSalao) => void;
}) {
  return (
    <div className={onPointerDownMesa ? "mapa mapa--editavel" : "mapa"} ref={refMapa}>
      {elementos.map((el) => {
        const rotulo = el.rotulo || (el.tipo === "parede" ? "" : el.tipo === "banheiro" ? "WC" : TIPOS_ELEMENTO[el.tipo].nome);
        // Mapa é 4:3: compara os lados em pixels. Elemento em pé (ex.: balcão do bar na parede) escreve na vertical.
        const vertical = el.h * 3 > el.w * 4 * 1.4;
        return (
          <div
            key={el.id}
            className={`mapa__el mapa__el--${el.tipo}${vertical ? " mapa__el--vertical" : ""}${el.id === elementoSelecionado ? " mapa__el--sel" : ""}`}
            style={{ left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%` }}
            aria-hidden={onPointerDownElemento ? undefined : true}
            title={onPointerDownElemento ? `${TIPOS_ELEMENTO[el.tipo].nome}: arraste para posicionar` : undefined}
            onPointerDown={onPointerDownElemento ? (e) => onPointerDownElemento(e, el) : undefined}
          >
            {rotulo && <span>{rotulo}</span>}
          </div>
        );
      })}
      {mesas.map((m) => {
        const est = estado(m);
        const cadeiras = Math.min(Math.max(m.lugares, 1), 12);
        return (
          <button
            key={m.id}
            type="button"
            className={`mapa__mesa mapa__mesa--${est}`}
            style={{ left: `${m.x}%`, top: `${m.y}%`, ["--t" as string]: tamanho(m.lugares) }}
            disabled={desativarOcupadas && (est === "ocupada" || est === "inativa")}
            aria-pressed={est === "selecionada"}
            aria-label={`Mesa ${m.numero}, ${m.lugares} lugares${m.area ? `, ${m.area}` : ""} — ${ROTULO[est]}`}
            title={`Mesa ${m.numero} · ${m.lugares} lugares${m.area ? ` · ${m.area}` : ""} · ${ROTULO[est]}`}
            onClick={onEscolher ? () => onEscolher(m) : undefined}
            onPointerDown={onPointerDownMesa ? (e) => onPointerDownMesa(e, m) : undefined}
          >
            <span className="mapa__cadeiras" aria-hidden="true">
              {Array.from({ length: cadeiras }, (_, i) => (
                <i key={i} style={{ ["--a" as string]: `${(360 / cadeiras) * i + (cadeiras === 4 ? 45 : 0)}deg` }} />
              ))}
            </span>
            <span className="mapa__tampo">
              <span className="mapa__num">{m.numero}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Legenda com as mesmas mesinhas do mapa. */
export function LegendaMapa() {
  const itens: { est: EstadoMesa; texto: string }[] = [
    { est: "livre", texto: "Livre" },
    { est: "selecionada", texto: "Sua escolha" },
    { est: "ocupada", texto: "Ocupada" },
  ];
  return (
    <div className="mapa__legenda" aria-hidden="true">
      {itens.map((i) => (
        <span key={i.est}>
          <b className={`mapa__legenda-mesa mapa__legenda-mesa--${i.est}`} />
          {i.texto}
        </span>
      ))}
      <span className="mapa__legenda-dica">Toque numa mesa livre para escolher</span>
    </div>
  );
}
