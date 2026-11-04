"use client";

import { formatData, type Edicao } from "@/lib/edicao";
import type { RegrasPublicas } from "@/lib/regrasEdicao";
import { CASAS, CASA_PADRAO, type CasaId } from "@/config/casas";
import ReservaMesa from "./ReservaMesa";

export type NoiteAberta = { casa: CasaId; edicao: Edicao; regras: RegrasPublicas; manual: boolean };

/**
 * Cada reserva é individual: uma tela, uma noite, sem seletor misturando noites ou casas. Com `?edicao=` (ou uma única
 * noite aberta) abre direto o mapa dela. Sem noite escolhida e com várias abertas, lista as noites, cada uma com o seu link.
 */
export default function ReservaVariasCasas({ noites, instagram, edicaoInicial }: { noites: NoiteAberta[]; instagram: string; edicaoInicial?: string }) {
  const noite = noites.find((n) => n.edicao.id === edicaoInicial) ?? (noites.length === 1 ? noites[0] : null);

  if (noite) {
    return (
      <ReservaMesa
        edicoes={[noite.edicao]}
        casa={noite.casa}
        instagram={noite.casa === CASA_PADRAO ? instagram : ""}
        manual={noite.manual}
        mostrarCasa
        regras={{ [noite.edicao.id]: noite.regras }}
      />
    );
  }

  return (
    <ul className="reserva__noites">
      {noites.map((n) => (
        <li key={n.edicao.id} className="placa placa--p placa--vazada">
          <div className="eyebrow">{formatData(n.edicao.data)} · {n.casa === CASA_PADRAO ? n.edicao.local || CASAS[n.casa].nome : CASAS[n.casa].nome}</div>
          <h2 className="display h-3">{n.edicao.artista || (n.casa === CASA_PADRAO ? "line-up em breve" : "atração a confirmar")}</h2>
          <a className="btn btn--terracota btn--p" href={`${CASAS[n.casa].pagina}?edicao=${encodeURIComponent(n.edicao.id)}`}>Reservar mesa</a>
        </li>
      ))}
    </ul>
  );
}
