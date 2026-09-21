import type { Metadata } from "next";
import { site, instagramUrl } from "@/config/site";
import { edicoesProntasParaSite } from "@/lib/regras";
import { regrasPublicas } from "@/lib/regrasEdicao";
import { estadoDasReservasDoSite } from "@/lib/reservasSite";
import ReservaMesa from "@/components/ReservaMesa";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reservar mesa",
  description: `Escolha sua mesa no mapa e reserve para a próxima ${site.nome} no ${site.casa.nome}, em ${site.cidade}.`,
  alternates: { canonical: "/reservar" },
};

export default async function Reservar() {
  // Reserva desligada (RESERVAS_SITE_ENABLED) ou sem como confirmar: a API recusa com 503, então não mostra o formulário à toa.
  const reservaAberta = estadoDasReservasDoSite().aberto;
  // Só edições completas e liberadas explicitamente para o site (regras no painel); nenhuma = "em breve".
  const prontas = reservaAberta ? await edicoesProntasParaSite() : [];
  const edicoes = prontas.map((p) => p.edicao);

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
            <p>
              {reservaAberta
                ? "Ainda não abrimos reservas para as próximas quintas."
                : "As reservas pelo site abrem em breve. Por enquanto, fale com a gente no Instagram."}
            </p>
            <a className="btn btn--terracota" href={instagramUrl(site.instagram)} target="_blank" rel="noopener noreferrer">
              Fale com a gente no Instagram
            </a>
          </div>
        ) : (
          <ReservaMesa edicoes={edicoes} instagram={site.instagram} regras={Object.fromEntries(prontas.map((p) => [p.edicao.id, regrasPublicas(p.regras)]))} />
        )}
      </div>
    </section>
  );
}
