"use client";

import { useState } from "react";
import { formatData, type Edicao } from "@/lib/edicao";
import type { RegrasPublicas } from "@/lib/regrasEdicao";
import { CASAS, CASA_PADRAO, type CasaId } from "@/config/casas";
import ReservaMesa from "./ReservaMesa";

export type NoiteAberta = { casa: CasaId; edicao: Edicao; regras: RegrasPublicas; manual: boolean };

/**
 * /reservar com TODAS as noites de reserva aberta, de todas as casas (Florindos, Harley Grill...), em ordem de data.
 * Escolher a noite abre o mapa da casa dela (cada casa tem o seu salão). Só uma casa com noites abertas = a tela de
 * sempre, com o seletor de noites da própria reserva.
 */
export default function ReservaVariasCasas({ noites, instagram, edicaoInicial }: { noites: NoiteAberta[]; instagram: string; edicaoInicial?: string }) {
  const casas = new Set(noites.map((n) => n.casa));
  const [escolhida, setEscolhida] = useState(() => (noites.some((n) => n.edicao.id === edicaoInicial) ? edicaoInicial! : noites[0].edicao.id));

  if (casas.size === 1) {
    const casa = noites[0].casa;
    return (
      <ReservaMesa
        edicoes={noites.map((n) => n.edicao)}
        casa={casa}
        instagram={casa === CASA_PADRAO ? instagram : ""}
        manual={noites[0].manual}
        mostrarCasa={casa !== CASA_PADRAO}
        edicaoInicial={edicaoInicial}
        regras={Object.fromEntries(noites.map((n) => [n.edicao.id, n.regras]))}
      />
    );
  }

  const noite = noites.find((n) => n.edicao.id === escolhida) ?? noites[0];
  return (
    <>
      <div className="reserva__edicoes" role="group" aria-label="Escolha a noite">
        {noites.map((n) => (
          <button key={n.edicao.id} type="button" className="filtro reserva__edicao" aria-pressed={n.edicao.id === noite.edicao.id} onClick={() => setEscolhida(n.edicao.id)}>
            {formatData(n.edicao.data)}
            <small>{n.edicao.artista || (n.casa === CASA_PADRAO ? "line-up em breve" : "atração a confirmar")}</small>
            <small className="reserva__edicao-casa">{n.casa === CASA_PADRAO ? n.edicao.local || CASAS[n.casa].nome : CASAS[n.casa].nome}</small>
          </button>
        ))}
      </div>
      {/* Uma reserva por noite (chave = edição): trocar de noite troca o mapa, o salão e o formulário. */}
      <ReservaMesa
        key={noite.edicao.id}
        edicoes={[noite.edicao]}
        casa={noite.casa}
        instagram={noite.casa === CASA_PADRAO ? instagram : ""}
        manual={noite.manual}
        mostrarCasa
        regras={{ [noite.edicao.id]: noite.regras }}
      />
    </>
  );
}
