import { formatData, type Edicao } from "@/lib/programacao";
import { instagramUrl } from "@/config/site";
import Aba from "./Aba";

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
      <div className="card__status">{STATUS[edicao.status]}</div>
      <div className="card__nome">{edicao.artista || "A confirmar"}</div>
      {edicao.tema && <div className="card__tema">{edicao.tema}</div>}
      {edicao.destaque && !edicao.tema && <div className="card__tema">{edicao.destaque}</div>}
      {edicao.instagram && (
        <a className="card__ig" href={instagramUrl(edicao.instagram)} target="_blank" rel="noopener noreferrer">
          @{edicao.instagram}
        </a>
      )}
      <Aba genero={edicao.genero} />
    </article>
  );
}
