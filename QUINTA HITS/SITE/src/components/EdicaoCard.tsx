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

export default function EdicaoCard({ edicao, passada = false }: { edicao: Edicao; passada?: boolean }) {
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
      {!passada && ehCasa(edicao.casa) && edicao.casa !== CASA_PADRAO && CASAS[edicao.casa].reservas && (
        <a className="card__reservar" href={CASAS[edicao.casa].pagina}>Reservar mesa →</a>
      )}
      <Aba genero={edicao.genero} />
    </article>
  );
}
