import { formatData, mesCurto, type Edicao } from "@/lib/programacao";
import { site, instagramUrl, reservaHref } from "@/config/site";
import Aba from "./Aba";
import Compartilhar from "./Compartilhar";

export default function ProximaEdicao({ edicao }: { edicao: Edicao }) {
  const [, , dia] = edicao.data.split("-");
  const mes = mesCurto(edicao.data);
  const horario = edicao.horario || site.horarioPadrao;
  const textoShare = edicao.artista
    ? `${edicao.artista} na QUINTA HITS, ${formatData(edicao.data, "longa")}, no ${site.casa.nome}. Se é quinta, tem Hits.`
    : `QUINTA HITS, ${formatData(edicao.data, "longa")}, no ${site.casa.nome}. Se é quinta, tem Hits.`;

  return (
    <div className="proxima">
      <div className="placa placa--creme proxima__data">
        <div>
          <div className="eyebrow">Próxima quinta</div>
          <div className="proxima__dia">{dia}</div>
          <div className="proxima__mes">{mes}</div>
        </div>
        <div className="muted" style={{ fontSize: 15 }}>
          {formatData(edicao.data, "longa")}
          {horario ? ` · a partir das ${horario}` : ""}
        </div>
        <Aba genero={edicao.genero} />
      </div>

      <div className="proxima__info">
        <div className="eyebrow">{edicao.tema || "No palco"}</div>
        <h3 className="display h-1">{edicao.artista || "Line-up em breve"}</h3>
        {edicao.destaque && <p className="lead mt-0 mb-0">{edicao.destaque}</p>}
        {!edicao.artista && (
          <p className="lead mt-0 mb-0">
            A atração da semana sai primeiro no Instagram. A quinta, essa já está garantida.
          </p>
        )}
        <div className="proxima__linha">
          <span>{site.casa.nome}</span>
          <span>{site.cidade}/{site.uf}</span>
          {edicao.instagram && (
            <a href={instagramUrl(edicao.instagram)} target="_blank" rel="noopener noreferrer">
              @{edicao.instagram}
            </a>
          )}
        </div>
        <div className="proxima__acoes">
          <a className="btn btn--terracota" href={reservaHref()} target="_blank" rel="noopener noreferrer">
            Reservar mesa
          </a>
          <Compartilhar titulo={site.nome} texto={textoShare} url={site.url} />
        </div>
      </div>
    </div>
  );
}
