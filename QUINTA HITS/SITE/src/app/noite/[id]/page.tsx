import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { instagramUrl, site } from "@/config/site";
import { formatData, mesCurto, proximasEdicoes } from "@/lib/programacao";
import { lerNoite, linkGoogleAgenda, tituloDaNoite } from "@/lib/noite";
import { origemDaRequisicao } from "@/lib/minhaReserva";
import Aba from "@/components/Aba";
import Countdown from "@/components/Countdown";
import Compartilhar from "@/components/Compartilhar";
import EdicaoCard from "@/components/EdicaoCard";
import { noitesComReservaAberta } from "@/lib/reservasAbertas";
import { jsonLdSeguro } from "@/lib/jsonLd";

export const dynamic = "force-dynamic";

const SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const diaDaSemana = (iso: string) => SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()];

/** Prévia do link (WhatsApp, Instagram, stories): "Voo Livre · 06/11 · Harley Grill", com a imagem da noite. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const n = await lerNoite(id).catch(() => null);
  if (!n) return { title: "Noite não encontrada" };
  const origem = await origemDaRequisicao();
  const titulo = `${n.edicao.artista || "Line-up em breve"} · ${formatData(n.edicao.data, "numerica")} · ${n.lugar}`;
  const descricao = [
    `${diaDaSemana(n.edicao.data)}, ${formatData(n.edicao.data, "longa").replace(/^[^,]+, /, "")}`,
    n.edicao.horario && `a partir das ${n.edicao.horario}`,
    n.reserva === "aberta" ? "Reserve sua mesa pelo site." : site.assinatura,
  ]
    .filter(Boolean)
    .join(" · ");
  const imagem = `${origem}/noite/${n.edicao.id}/imagem.png`;
  return {
    title: { absolute: `${titulo} — ${site.nome}` },
    description: descricao,
    alternates: { canonical: `/noite/${n.edicao.id}` },
    openGraph: { title: titulo, description: descricao, url: `${origem}/noite/${n.edicao.id}`, siteName: site.nome, type: "website", locale: "pt_BR", images: [{ url: imagem, width: 1200, height: 630, alt: titulo }] },
    twitter: { card: "summary_large_image", title: titulo, description: descricao, images: [imagem] },
  };
}

/**
 * Página de UMA noite (/noite/<id da edição>), de qualquer casa: o link para divulgar (stories, WhatsApp, bio). Data,
 * atração, onde, contagem, reservar (quando a noite está aberta), adicionar à agenda e chamar a turma.
 */
export default async function Noite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = await lerNoite(id);
  if (!n) notFound();
  const e = n.edicao;
  const origem = await origemDaRequisicao();
  const url = `${origem}/noite/${e.id}`;
  const [, , dia] = e.data.split("-");
  const cancelada = e.status === "cancelada";
  const outras = (await proximasEdicoes(new Date(), 4)).filter((x) => x.id !== e.id).slice(0, 3);
  const abertas = await noitesComReservaAberta();
  const textoShare = `${e.artista ? `${e.artista} · ` : ""}${diaDaSemana(e.data)}, ${formatData(e.data, "numerica")}${e.horario ? `, ${e.horario}` : ""} no ${n.lugar}. ${site.assinatura}`;

  const eventoLd = {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: `${site.nome} — ${e.artista || "Line-up em breve"}`,
    startDate: n.temHorario ? n.inicio.toISOString() : e.data,
    eventStatus: cancelada ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(e.artista ? { performer: { "@type": "MusicGroup", name: e.artista } } : {}),
    organizer: { "@type": "Organization", name: site.empresa },
    url,
    image: `${origem}/noite/${e.id}/imagem.png`,
    location: { "@type": "Place", name: n.lugar, address: n.endereco || `${site.cidade}/${site.uf}` },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSeguro(eventoLd) }} />
      <section className="secao secao--verde noite">
        <div className="wrap">
          <Link className="noite__voltar" href="/programacao">← Toda a programação</Link>
          <div className="noite__grade">
            <div className="placa placa--creme noite__data">
              <div>
                <div className="eyebrow">{diaDaSemana(e.data)}</div>
                <div className="noite__dia">{dia}</div>
                <div className="noite__mes">{mesCurto(e.data)}</div>
              </div>
              <div className="noite__hora">{e.horario ? `A partir das ${e.horario}` : "Horário em breve"}</div>
              <Aba genero={e.genero} />
            </div>

            <div className="noite__info">
              <div className="eyebrow">
                {n.casa.id === "quinta-hits" ? site.nome : `${site.nome} no ${n.casa.nome}`}
                {e.tema ? ` · ${e.tema}` : ""}
              </div>
              <h1 className="display h-1 noite__titulo">{e.artista || "Line-up em breve"}</h1>
              {e.destaque && <p className="lead mt-0 mb-0">{e.destaque}</p>}
              {cancelada && <p className="noite__aviso">Esta noite foi cancelada.</p>}
              <div className="proxima__linha">
                <span>{n.lugar}</span>
                <span>{site.cidade}/{site.uf}</span>
                {e.instagram && (
                  <a href={instagramUrl(e.instagram)} target="_blank" rel="noopener noreferrer">@{e.instagram}</a>
                )}
              </div>

              {!cancelada && !n.passou && (
                <div className="proxima__acoes">
                  {n.reserva === "aberta" && (
                    <Link className="btn btn--terracota" href={`/reservar?edicao=${encodeURIComponent(e.id)}`}>Reservar mesa</Link>
                  )}
                  {n.reserva === "em_breve" && <span className="noite__selo">Reservas abrem em breve</span>}
                  <details className="noite__agenda">
                    <summary className="btn btn--vazado">Adicionar à agenda</summary>
                    <div className="noite__agenda-menu">
                      <a href={linkGoogleAgenda(n, url)} target="_blank" rel="noopener noreferrer">Google Agenda</a>
                      <a href={`/noite/${e.id}/agenda.ics`}>iPhone, Outlook e outras</a>
                    </div>
                  </details>
                  <Compartilhar titulo={tituloDaNoite(n)} texto={textoShare} url={url} />
                </div>
              )}
              {n.passou && <p className="noite__aviso">Essa noite já rolou. Veja as próximas na programação.</p>}
              {!cancelada && !n.passou && <Countdown alvoISO={n.inicio.toISOString()} dataISO={e.data} />}
            </div>
          </div>
        </div>
      </section>

      <section className="secao secao--creme">
        <div className="wrap noite__baixo">
          <div className="noite__onde">
            <div className="eyebrow">Onde</div>
            <h2 className="display h-2" style={{ margin: "6px 0 10px" }}>{n.lugar}</h2>
            {n.endereco && <p className="lead mt-0">{n.endereco}</p>}
            {n.mapsUrl && (
              <a className="btn btn--vazado btn--p" href={n.mapsUrl} target="_blank" rel="noopener noreferrer">Abrir no mapa</a>
            )}
          </div>
          {n.reserva === "aberta" && !n.passou && (
            <div className="noite__como">
              <div className="eyebrow">Reserva de mesa</div>
              <ol>
                <li>Escolha sua mesa no mapa do {n.lugar}.</li>
                <li>A equipe confirma pelo seu WhatsApp.</li>
                <li>Na porta, mostre o QR que chega na confirmação.</li>
              </ol>
            </div>
          )}
        </div>
        {outras.length > 0 && (
          <div className="wrap" style={{ marginTop: "clamp(48px, 7vw, 96px)" }}>
            <div className="cabeca">
              <div>
                <div className="eyebrow">Programação</div>
                <h2 className="display h-2" style={{ margin: "6px 0 0" }}>Outras noites.</h2>
              </div>
              <Link className="btn btn--vazado btn--p" href="/programacao">Ver todas</Link>
            </div>
            <div className="edicoes">{outras.map((x) => <EdicaoCard key={x.id} edicao={x} reservaAberta={abertas.includes(x.id)} />)}</div>
          </div>
        )}
      </section>
    </>
  );
}
