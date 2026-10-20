"use client";

import type { CSSProperties, PointerEvent, Ref } from "react";
import type { MesaPublica } from "@/lib/reserva";
import { TIPOS_ELEMENTO, type ElementoSalao } from "@/lib/planta";
import type { MapaDaCasa } from "@/config/casas";

/** `pendente`: só no painel, pedido esperando a equipe confirmar. */
export type EstadoMesa = "livre" | "ocupada" | "selecionada" | "inativa" | "pendente";

/** Tamanho da mesa (tampo + cadeiras) em % da largura do mapa, conforme os lugares. */
function tamanho(lugares: number): number {
  if (lugares <= 2) return 8;
  if (lugares <= 4) return 10;
  if (lugares <= 6) return 12;
  return 14;
}

const ROTULO: Record<EstadoMesa, string> = {
  livre: "livre",
  ocupada: "reservada",
  selecionada: "sua escolha",
  inativa: "desativada",
  pendente: "pedido para confirmar",
};

/**
 * Planta do salão: elementos fixos (palco, bar, entrada...) ao fundo e as mesas por cima, cada uma um botão
 * posicionado em % (x/y = centro) com tampo e cadeiras conforme os lugares.
 * Usado no site (cliente escolhe) e no painel (equipe arrasta mesas e elementos para posicionar).
 *
 * `planta` (casa com planta própria, ex.: Harley Grill): a imagem da planta vai ao fundo, na proporção dela, e as mesas
 * viram quadradinhos numerados do tamanho das mesas do desenho. Com largura mínima, o mapa rola para o lado no celular.
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
  planta = null,
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
  planta?: MapaDaCasa | null;
}) {
  const compacta = planta?.tamanhoMesa ?? null;
  const proporcao = planta?.proporcao ?? 4 / 3;
  const estilo: CSSProperties = {};
  if (proporcao !== 4 / 3) estilo.aspectRatio = String(proporcao);
  if (planta?.fundo) estilo.backgroundImage = `url(${planta.fundo})`;
  if (planta?.larguraMinima) estilo.minWidth = planta.larguraMinima;
  const mapa = (
    <div
      className={`mapa${onPointerDownMesa ? " mapa--editavel" : ""}${planta?.fundo ? " mapa--planta" : ""}`}
      ref={refMapa}
      style={Object.keys(estilo).length ? estilo : undefined}
    >
      {elementos.map((el) => {
        const rotulo = el.rotulo || (el.tipo === "parede" ? "" : el.tipo === "banheiro" ? "WC" : TIPOS_ELEMENTO[el.tipo].nome);
        // Compara os lados em pixels (o mapa tem a proporção da casa). Elemento em pé (ex.: balcão na parede) escreve na vertical.
        const vertical = el.h > el.w * proporcao * 1.4;
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
        const cadeiras = compacta ? 0 : Math.min(Math.max(m.lugares, 1), 12);
        return (
          <button
            key={m.id}
            type="button"
            className={`mapa__mesa mapa__mesa--${est}${compacta ? " mapa__mesa--compacta" : ""}${planta?.destaque && m.area === planta.destaque.area ? " mapa__mesa--destaque" : ""}`}
            style={{ left: `${m.x}%`, top: `${m.y}%`, ["--t" as string]: compacta ?? tamanho(m.lugares) }}
            disabled={desativarOcupadas && (est === "ocupada" || est === "inativa")}
            aria-pressed={est === "selecionada"}
            aria-label={`Mesa ${m.numero}, ${m.lugares} lugares${m.area ? `, ${m.area}` : ""} — ${ROTULO[est]}`}
            title={`Mesa ${m.numero} · ${m.lugares} lugares${m.area ? ` · ${m.area}` : ""} · ${ROTULO[est]}`}
            onClick={onEscolher ? () => onEscolher(m) : undefined}
            onPointerDown={onPointerDownMesa ? (e) => onPointerDownMesa(e, m) : undefined}
          >
            {cadeiras > 0 && (
              <span className="mapa__cadeiras" aria-hidden="true">
                {Array.from({ length: cadeiras }, (_, i) => (
                  <i key={i} style={{ ["--a" as string]: `${(360 / cadeiras) * i + (cadeiras === 4 ? 45 : 0)}deg` }} />
                ))}
              </span>
            )}
            <span className="mapa__tampo">
              <span className="mapa__num">{m.numero}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
  // Planta larga (muitas mesas): rola para o lado em tela estreita, sem encolher as mesas até ficarem intocáveis.
  return planta?.larguraMinima ? <div className="mapa-rolagem">{mapa}</div> : mapa;
}

/** Legenda com as mesmas mesinhas do mapa. */
export function LegendaMapa({ painel = false, destaque = null }: { painel?: boolean; destaque?: string | null }) {
  const itens: { est: EstadoMesa; texto: string }[] = painel
    ? [
        { est: "livre", texto: "Livre" },
        { est: "pendente", texto: "Para confirmar" },
        { est: "ocupada", texto: "Reservada" },
      ]
    : [
    { est: "livre", texto: "Livre" },
    { est: "selecionada", texto: "Sua escolha" },
    { est: "ocupada", texto: "Reservada" },
      ];
  return (
    <div className="mapa__legenda" aria-hidden="true">
      {itens.map((i) => (
        <span key={i.est}>
          <b className={`mapa__legenda-mesa mapa__legenda-mesa--${i.est}`} />
          {i.texto}
        </span>
      ))}
      {destaque && (
        <span>
          <b className="mapa__legenda-mesa mapa__legenda-mesa--destaque" />
          {destaque}
        </span>
      )}
      {!painel && <span className="mapa__legenda-dica">Toque numa mesa livre para escolher</span>}
    </div>
  );
}
