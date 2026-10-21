import Image from "next/image";
import Link from "next/link";
import { alvoLink, instagramUrl } from "@/config/site";
import { getSiteConfig, reservaHrefFrom } from "@/lib/siteConfig";
import { edicoesAnteriores, formatData, inicioDaEdicao, proximaEdicao, proximasEdicoes, temEdicaoHoje } from "@/lib/programacao";
import Countdown from "@/components/Countdown";
import Marquee from "@/components/Marquee";
import ProximaEdicao from "@/components/ProximaEdicao";
import EdicaoCard from "@/components/EdicaoCard";
import Vinil from "@/components/Vinil";
import { ComoChegarCasa } from "@/components/OutraCasa";
import { OUTRAS_CASAS } from "@/config/casas";
import { dadosDaCasa } from "@/lib/casasDados";

// A página é regenerada a cada minuto: a "próxima noite" e a contagem mudam sozinhas.
export const revalidate = 60;

const PILARES = [
  { n: "01", t: "Música ao vivo", p: "Rock, pop rock, hits, anos 2000, DJs, música brasileira. A programação muda a cada noite. A energia, não." },
  { n: "02", t: "Bar e drinks", p: "Boteco gourmet contemporâneo: bebida boa, mesa boa e aquela história que era pra ser “só uma”." },
  { n: "03", t: "Amigos e encontros", p: "Ponto de encontro de quem não espera o fim de semana pra sair. Chama a turma, chega junto." },
  { n: "04", t: "Noite que vira história", p: "A noite de Uberlândia começa aqui. Tem Hits, tem noite — e o resto da semana que se ajeite." },
];

export default async function Home() {
  const agora = new Date();
  const site = await getSiteConfig();
  const reserva = reservaHrefFrom(site);
  const proxima = await proximaEdicao(agora);
  const proximas = await proximasEdicoes(agora, 4);
  const anteriores = await edicoesAnteriores(agora);
  const temHoje = await temEdicaoHoje(agora);
  // Outras casas (Harley Grill, Solarium...): "como chegar" na seção Onde (erro de banco = "Em breve", sem derrubar a
  // home). As noites delas entram na agenda única, junto com as do Florindos.
  const outras = await Promise.all(OUTRAS_CASAS.map(async (c) => ({ casa: c, dados: await dadosDaCasa(c) })));
  // Contagem até o próximo evento cadastrado (canceladas puladas). Sem data futura na agenda, sem contagem.
  const alvo = proxima ? inicioDaEdicao(proxima.data, proxima.horario, site.horarioPadrao).toISOString() : null;

  // Dados estruturados da agenda real: as datas que de fato existem, com artista confirmado.
  const agendaLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Programação ${site.nome}`,
    itemListElement: (await proximasEdicoes(agora, 8))
      .filter((e) => e.artista !== "")
      .map((e, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "MusicEvent",
          name: `${site.nome} — ${e.artista}`,
          startDate: e.data,
          eventStatus: "https://schema.org/EventScheduled",
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          performer: { "@type": "MusicGroup", name: e.artista },
          organizer: { "@type": "Organization", name: site.empresa },
          url: `${site.url}/programacao`,
          location: {
            "@type": "Place",
            name: e.local || site.casa.nome,
            address: {
              "@type": "PostalAddress",
              streetAddress: [site.casa.endereco, site.casa.bairro].filter(Boolean).join(" — "),
              addressLocality: site.cidade,
              addressRegion: site.uf,
              addressCountry: "BR",
            },
          },
        },
      })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(agendaLd) }} />

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
              Música ao vivo, amigos, drinks e encontros. As melhores noites de {site.cidade}, uma de cada vez — escolha a sua.
            </p>
            <div className="hero__acoes">
              <a className="btn btn--terracota" href={reserva} {...alvoLink(reserva)}>
                Reservar mesa
              </a>
              <Link className="btn btn--vazado" href="/programacao">Ver programação</Link>
            </div>
            {proxima && alvo && <Countdown alvoISO={alvo} dataISO={proxima.data} />}
          </div>
        </div>
      </section>

      <Marquee />

      {/* PRÓXIMA NOITE (só com data futura na agenda) */}
      {proxima && (
        <section className="secao secao--verde" id="proxima">
          <div className="wrap">
            <ProximaEdicao edicao={proxima} site={site} />
          </div>
        </section>
      )}

      {/* PROGRAMAÇÃO */}
      <section className="secao secao--creme" id="programacao">
        <div className="wrap">
          <div className="cabeca">
            <div>
              <div className="eyebrow">Programação</div>
              <h2 className="display h-2" style={{ margin: "6px 0 0" }}>As próximas noites</h2>
            </div>
            <Link className="btn btn--vazado btn--p" href="/programacao">Calendário completo</Link>
          </div>
          {proximas.length > 0 ? (
            <div className="edicoes">
              {proximas.map((e) => <EdicaoCard key={e.id} edicao={e} />)}
            </div>
          ) : (
            <p className="vazio">A próxima noite sai primeiro no Instagram. Fica de olho: @{site.instagram}.</p>
          )}
        </div>
      </section>

      {/* EXPERIÊNCIA */}
      <section className="secao secao--verde" id="experiencia">
        <div className="wrap">
          <div className="cabeca">
            <div>
              <div className="eyebrow">A experiência</div>
              <h2 className="display h-2" style={{ margin: "6px 0 0" }}>O lugar para estar à noite</h2>
            </div>
            <p className="muted" style={{ maxWidth: "36ch" }}>
              A programação traz o público. A experiência faz voltar. A noite vira hábito.
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
            <p>E agora, em {site.cidade}, a noite tem nome: {site.nome}.</p>
            <p>A programação muda. Os encontros mudam. As histórias também. Os Hits permanecem.</p>
            <p><strong>{temHoje ? "Hoje tem Quinta Hits." : site.assinatura}</strong></p>

            {anteriores.length > 0 && (
              <div className="anteriores">
                <div className="eyebrow" style={{ marginBottom: 12 }}>Já passaram pela Quinta Hits</div>
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
              A casa da {site.nome} em {site.cidade}. Do fim da tarde até a noite virar.
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
              <div><dt>Quando</dt><dd>Nas datas da agenda{site.horarioPadrao ? `, a partir das ${site.horarioPadrao}` : ""}</dd></div>
            </dl>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a className="btn btn--creme btn--p" href={site.casa.mapsUrl} target="_blank" rel="noopener noreferrer">Abrir no mapa</a>
              <a className="btn btn--vazado btn--p" href={reserva} {...alvoLink(reserva)}>Reservar mesa</a>
            </div>
          </div>
        </div>
        {outras.map(({ casa, dados }) => <ComoChegarCasa key={casa} casa={casa} dados={dados} />)}
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
