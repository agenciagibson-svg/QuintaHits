import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { instagramUrl, site } from "@/config/site";
import { ARTISTAS, artistaPorSlug, proximosShows } from "@/config/artistas";
import { formatData, hojeISO, mesCurto } from "@/lib/edicao";

export const revalidate = 3600;

export function generateStaticParams() {
  return ARTISTAS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = artistaPorSlug(slug);
  if (!a) return { title: "Artista não encontrado" };
  const descricao = `${a.nome} · ${a.estilo}. Agenda de shows e noites na ${site.nome}.`;
  return {
    title: a.nome,
    description: descricao,
    alternates: { canonical: `/artistas/${a.slug}` },
    openGraph: { title: a.nome, description: descricao, url: `/artistas/${a.slug}`, siteName: site.nome, type: "profile", locale: "pt_BR", images: [{ url: a.foto, alt: a.nome }] },
  };
}

const SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const diaDaSemana = (iso: string) => SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()];

/** Página do artista: foto, estilo e a agenda de shows abertos (dentro e fora das casas da marca). */
export default async function PaginaArtista({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = artistaPorSlug(slug);
  if (!a) notFound();
  const shows = proximosShows(a, hojeISO());

  return (
    <>
      <section className="secao secao--verde artista">
        <div className="wrap">
          <Link className="noite__voltar" href="/programacao">← Toda a programação</Link>
          <div className="artista__grade">
            <div className="artista__foto">
              <Image src={a.foto} alt={a.nome} width={480} height={600} priority />
            </div>
            <div className="artista__info">
              <div className="eyebrow">Artista · {a.estilo}</div>
              <h1 className="display h-1 noite__titulo">{a.nome}</h1>
              {a.instagram && (
                <a className="artista__ig" href={instagramUrl(a.instagram)} target="_blank" rel="noopener noreferrer">@{a.instagram}</a>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="secao secao--creme">
        <div className="wrap">
          <div className="eyebrow">Agenda</div>
          <h2 className="display h-2" style={{ margin: "6px 0 24px" }}>Próximos shows.</h2>
          {shows.length === 0 ? (
            <p className="lead mt-0">Agenda nova em breve.</p>
          ) : (
            <ul className="artista__agenda">
              {shows.map((s) => {
                const [, , dia] = s.data.split("-");
                return (
                  <li key={`${s.data}-${s.cidade}`} className="artista__show">
                    <div className="artista__show-data">
                      <span className="artista__show-dia">{dia}</span>
                      <span className="artista__show-mes">{mesCurto(s.data)}</span>
                    </div>
                    <div className="artista__show-info">
                      <div className="artista__show-titulo">{s.titulo ?? s.local ?? s.cidade}</div>
                      <div className="muted">
                        {diaDaSemana(s.data)}, {formatData(s.data, "numerica")} · {[s.titulo && s.local, `${s.cidade}/${s.uf}`].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {s.noite && (
                      <Link className="btn btn--terracota btn--p" href={`/noite/${s.noite}`}>Ver a noite e reservar</Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
