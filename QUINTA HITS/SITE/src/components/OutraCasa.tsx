import Link from "next/link";
import { instagramUrl } from "@/config/site";
import { CASAS, type CasaId } from "@/config/casas";
import { mapsUrlDe, type DadosCasa } from "@/lib/casasDados";
import type { Edicao } from "@/lib/edicao";
import EdicaoCard from "./EdicaoCard";

/**
 * Outra casa (ex.: Harley Grill) no site da Quinta Hits: a agenda dela, separada das quintas, e o "como chegar".
 * A reserva sempre leva à página da casa (mapa e regras dela).
 */

/** Seção com os próximos eventos da casa. Sem evento futuro, não aparece. */
export function AgendaDaCasa({ casa, eventos, titulo = "Próximos eventos", tom = "preto" }: { casa: CasaId; eventos: Edicao[]; titulo?: string; tom?: "preto" | "creme" }) {
  if (eventos.length === 0) return null;
  const c = CASAS[casa];
  return (
    <section className={`secao secao--${tom}`} id={casa}>
      <div className="wrap">
        <div className="cabeca">
          <div>
            <div className="eyebrow">{c.nome}</div>
            <h2 className="display h-2" style={{ margin: "6px 0 0" }}>{titulo}</h2>
          </div>
          <Link className={`btn ${tom === "preto" ? "btn--creme" : "btn--terracota"} btn--p`} href={c.pagina}>
            Reservar mesa no {c.nome}
          </Link>
        </div>
        <div className="edicoes">
          {eventos.map((e) => <EdicaoCard key={e.id} edicao={e} />)}
        </div>
      </div>
    </section>
  );
}

/** Bloco "Como chegar" da casa, no mesmo desenho do Florindos Bar. Campo vazio não aparece; sem endereço, "Em breve". */
export function ComoChegarCasa({ casa, dados }: { casa: CasaId; dados: DadosCasa }) {
  const c = CASAS[casa];
  const mapa = mapsUrlDe(dados, c.nome);
  return (
    <div className="wrap local local--outra">
      <div>
        <div className="eyebrow">Também no</div>
        <h2 className="display h-1" style={{ margin: "6px 0 16px" }}>{c.nome}</h2>
        <p className="lead">Eventos com reserva de mesa pelo mapa do salão: escolha a sua e a gente confirma pelo WhatsApp.</p>
      </div>
      <div className="placa placa--verde local__placa">
        <h3 className="display h-3">Como chegar</h3>
        <dl className="local__linhas">
          <div><dt>Casa</dt><dd>{c.nome}</dd></div>
          <div><dt>Endereço</dt><dd>{dados.endereco ? [dados.endereco, dados.bairro].filter(Boolean).join(" — ") : "Em breve"}</dd></div>
          {dados.instagram && (
            <div><dt>Instagram</dt><dd><a href={instagramUrl(dados.instagram)} target="_blank" rel="noopener noreferrer">@{dados.instagram}</a></dd></div>
          )}
          {dados.cidade && <div><dt>Cidade</dt><dd>{dados.cidade}</dd></div>}
          {dados.quando && <div><dt>Quando</dt><dd>{dados.quando}</dd></div>}
        </dl>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {mapa && <a className="btn btn--creme btn--p" href={mapa} target="_blank" rel="noopener noreferrer">Abrir no mapa</a>}
          <Link className="btn btn--vazado btn--p" href={c.pagina}>Reservar mesa</Link>
        </div>
      </div>
    </div>
  );
}
