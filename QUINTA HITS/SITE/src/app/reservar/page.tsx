import type { Metadata } from "next";
import { site, instagramUrl } from "@/config/site";
import { edicoesReservaveis } from "@/lib/reservas";
import ReservaMesa from "@/components/ReservaMesa";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reservar mesa",
  description: `Escolha sua mesa no mapa e reserve para a próxima ${site.nome} no ${site.casa.nome}, em ${site.cidade}.`,
  alternates: { canonical: "/reservar" },
};

export default async function Reservar() {
  const edicoes = await edicoesReservaveis();

  return (
    <section className="secao secao--creme">
      <div className="wrap">
        <div className="cabeca">
          <div>
            <div className="eyebrow">Reserva de mesa</div>
            <h1 className="display h-1" style={{ margin: "6px 0 0" }}>Escolha sua mesa.</h1>
          </div>
        </div>
        {edicoes.length === 0 ? (
          <div className="vazio">
            <p>Ainda não abrimos reservas para as próximas quintas.</p>
            <a className="btn btn--terracota" href={instagramUrl(site.instagram)} target="_blank" rel="noopener noreferrer">
              Fale com a gente no Instagram
            </a>
          </div>
        ) : (
          <ReservaMesa edicoes={edicoes} instagram={site.instagram} />
        )}
      </div>
    </section>
  );
}
