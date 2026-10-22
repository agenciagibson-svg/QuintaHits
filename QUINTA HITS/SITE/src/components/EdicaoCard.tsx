import { formatData, type Edicao } from "@/lib/edicao";
import { instagramUrl } from "@/config/site";
import Aba from "./Aba";
import { CASAS, CASA_PADRAO, ehCasa } from "@/config/casas";

const STATUS: Record<Edicao["status"], string> = {
  realizada: "já rolou",
  confirmada: "confirmado",
  a_confirmar: "line-up em breve",
  cancelada: "cancelada",
};

/**
 * `reservaAberta`: a noite aceita reserva pelo site agora → "Reservar mesa" leva ao mapa DESTA noite. Casa com reserva,
 * noite ainda não liberada → "Reservas em breve" (nunca leva ao mapa de outra data).
 */
export default function EdicaoCard({ edicao, passada = false, reservaAberta = false }: { edicao: Edicao; passada?: boolean; reservaAberta?: boolean }) {
  const casa = CASAS[ehCasa(edicao.casa) ? edicao.casa : CASA_PADRAO];
  const cor = passada ? "placa--preto" : "placa--verde";
  return (
    <article className={`placa ${cor} card ${passada ? "card--passada" : ""}`}>
      <div className="card__data">
        {formatData(edicao.data)}
      </div>
      <div className="card__status">
        {STATUS[edicao.status]}
        {/* Noite em outra casa (ex.: Harley Grill): o card diz onde. */}
        {ehCasa(edicao.casa) && edicao.casa !== CASA_PADRAO && <span className="card__casa"> · {CASAS[edicao.casa].nome}</span>}
      </div>
      <div className="card__nome">{edicao.artista || "A confirmar"}</div>
      {edicao.tema && <div className="card__tema">{edicao.tema}</div>}
      {edicao.destaque && !edicao.tema && <div className="card__tema">{edicao.destaque}</div>}
      {edicao.instagram && (
        <a className="card__ig" href={instagramUrl(edicao.instagram)} target="_blank" rel="noopener noreferrer">
          @{edicao.instagram}
        </a>
      )}
      {!passada && edicao.status !== "cancelada" && (
        <a className="card__ver" href={`/noite/${edicao.id}`}>Ver a noite →</a>
      )}
      {!passada && edicao.status !== "cancelada" && casa.reservas &&
        (reservaAberta ? (
          <a className="card__reservar" href={`/reservar?edicao=${encodeURIComponent(edicao.id)}`}>Reservar mesa →</a>
        ) : (
          <span className="card__em-breve">Reservas em breve</span>
        ))}
      <Aba genero={edicao.genero} />
    </article>
  );
}
