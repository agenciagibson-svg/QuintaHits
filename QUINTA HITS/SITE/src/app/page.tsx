import Image from "next/image";
import Link from "next/link";
import { instagramUrl } from "@/config/site";
import { getSiteConfig, reservaHrefFrom } from "@/lib/siteConfig";
import { edicoesAnteriores, formatData, inicioProximaQuinta, proximaEdicao, proximasEdicoes } from "@/lib/programacao";
import Countdown from "@/components/Countdown";
import Marquee from "@/components/Marquee";
import ProximaEdicao from "@/components/ProximaEdicao";
import EdicaoCard from "@/components/EdicaoCard";
import Vinil from "@/components/Vinil";

// A página é regenerada a cada minuto: a "próxima quinta" e a contagem mudam sozinhas.
export const revalidate = 60;

const PILARES = [
  { n: "01", t: "Música ao vivo", p: "Rock, pop rock, hits, anos 2000, DJs, música brasileira. A programação muda toda semana. A quinta, não." },
  { n: "02", t: "Bar e drinks", p: "Boteco gourmet contemporâneo: bebida boa, mesa boa e aquela história que era pra ser “só uma”." },
  { n: "03", t: "Amigos e encontros", p: "Ponto de encontro de quem quer começar o fim de semana antes. Chama a turma, chega junto." },
  { n: "04", t: "Quinta que vira sexta", p: "A noite de Uberlândia começa aqui. Se é quinta, tem Hits — e o resto da semana que se ajeite." },
];

export default async function Home() {
  const agora = new Date();
  const site = await getSiteConfig();
  const reserva = reservaHrefFrom(site);
  const proxima = await proximaEdicao(agora);
  const proximas = await proximasEdicoes(agora, 4);
  const anteriores = await edicoesAnteriores(agora);
  const alvo = inicioProximaQuinta(agora, site.horarioPadrao).toISOString();

  return (
    <>
      {/* HERO */}
      <section className="secao--creme hero">
        <div className="wrap hero__in">
          <div className="hero__logo">
            <Image src="/brand/logo-placa.svg" alt="QUINTA HITS" width={898} height={824} priority unoptimized />
          </div>
          <div className="hero__texto">
            <div className="eyebrow">{site.slogan}</div>
            <h1 className="display h-hero">{site.pontoDePartida}</h1>
            <p className="lead">
              Música, amigos, drinks e encontros. Toda quinta, no {site.casa.nome}, em {site.cidade}.
            </p>
            <div className="hero__acoes">
              <a className="btn btn--terracota" href={reserva} target="_blank" rel="noopener noreferrer">
                Reservar mesa
              </a>
              <Link className="btn btn--vazado" href="/programacao">Ver programação</Link>
            </div>
            <Countdown alvoISO={alvo} dataISO={proxima.data} />
          </div>
        </div>
      </section>

      <Marquee />

      {/* PRÓXIMA EDIÇÃO */}
      <section className="secao secao--verde" id="proxima">
        <div className="wrap">
          <ProximaEdicao edicao={proxima} site={site} />
        </div>
      </section>

      {/* PROGRAMAÇÃO */}
      <section className="secao secao--creme" id="programacao">
        <div className="wrap">
          <div className="cabeca">
            <div>
              <div className="eyebrow">Programação</div>
              <h2 className="display h-2" style={{ margin: "6px 0 0" }}>As próximas quintas</h2>
            </div>
            <Link className="btn btn--vazado btn--p" href="/programacao">Calendário completo</Link>
          </div>
          <div className="edicoes">
            {proximas.map((e) => <EdicaoCard key={e.id} edicao={e} />)}
          </div>
        </div>
      </section>

      {/* EXPERIÊNCIA */}
      <section className="secao secao--verde" id="experiencia">
        <div className="wrap">
          <div className="cabeca">
            <div>
              <div className="eyebrow">A experiência</div>
              <h2 className="display h-2" style={{ margin: "6px 0 0" }}>O lugar para estar na quinta</h2>
            </div>
            <p className="muted" style={{ maxWidth: "36ch" }}>
              A programação traz o público. A experiência faz voltar. A quinta vira hábito.
            </p>
          </div>
          <div className="grade-4">
            {PILARES.map((p) => (
              <div key={p.n} className="placa placa--creme pilar">
                <div className="pilar__num">{p.n}</div>
                <h3 className="display h-3">{p.t}</h3>
                <p>{p.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SELO / MANIFESTO */}
      <section className="secao secao--preto" id="selo">
        <div className="wrap manifesto">
          <Vinil />
          <div className="manifesto__texto">
            <p><strong>{site.pontoDePartida}</strong></p>
            <p>E agora, em {site.cidade}, quinta tem nome: {site.nome}.</p>
            <p>A programação muda. Os encontros mudam. As histórias também. A quinta permanece.</p>
            <p><strong>Hoje é quinta. Tem Quinta Hits.</strong></p>

            {anteriores.length > 0 && (
              <div className="anteriores">
                <div className="eyebrow" style={{ marginBottom: 12 }}>Já passaram pela Quinta</div>
                <ul>
                  {anteriores.map((e) => (
                    <li key={e.id}>
                      <span>{e.artista}{e.tema ? ` · ${e.tema}` : ""}</span>
                      <span>{formatData(e.data, "numerica")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ONDE */}
      <section className="secao secao--creme" id="onde">
        <div className="wrap local">
          <div>
            <div className="eyebrow">Onde</div>
            <h2 className="display h-1" style={{ margin: "6px 0 16px" }}>{site.casa.nome}</h2>
            <p className="lead">
              A casa da {site.nome} em {site.cidade}. Toda quinta, a partir do fim da tarde, até a noite virar.
            </p>
          </div>
          <div className="placa placa--verde local__placa">
            <h3 className="display h-3">Como chegar</h3>
            <dl className="local__linhas">
              <div><dt>Casa</dt><dd>{site.casa.nome}</dd></div>
              <div><dt>Endereço</dt><dd>{site.casa.endereco ? [site.casa.endereco, site.casa.bairro].filter(Boolean).join(" — ") : "Em breve — consulte o Instagram"}</dd></div>
              {site.casa.instagram && (
                <div><dt>Instagram</dt><dd><a href={instagramUrl(site.casa.instagram)} target="_blank" rel="noopener noreferrer">@{site.casa.instagram}</a></dd></div>
              )}
              <div><dt>Cidade</dt><dd>{site.cidade}/{site.uf}</dd></div>
              <div><dt>Quando</dt><dd>Toda quinta-feira{site.horarioPadrao ? `, a partir das ${site.horarioPadrao}` : ""}</dd></div>
            </dl>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a className="btn btn--creme btn--p" href={site.casa.mapsUrl} target="_blank" rel="noopener noreferrer">Abrir no mapa</a>
              <a className="btn btn--vazado btn--p" href={reserva} target="_blank" rel="noopener noreferrer">Reservar mesa</a>
            </div>
          </div>
        </div>
      </section>

      {/* INSTAGRAM */}
      <section className="secao secao--verde ig" id="instagram">
        <div className="wrap">
          <div className="eyebrow">Programação e bastidores, toda semana</div>
          <a className="display ig__handle" href={instagramUrl(site.instagram)} target="_blank" rel="noopener noreferrer">
            @{site.instagram}
          </a>
          <div className="ig__tags">
            {site.hashtags.map((h) => <span key={h}>{h}</span>)}
          </div>
        </div>
      </section>
    </>
  );
}
