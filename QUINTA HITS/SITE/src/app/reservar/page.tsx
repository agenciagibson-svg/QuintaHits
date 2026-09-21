import type { Metadata } from "next";
import { site, instagramUrl } from "@/config/site";
import { edicoesReservaveis } from "@/lib/reservas";
import { whatsappConfigurado } from "@/lib/whatsapp";
import ReservaMesa from "@/components/ReservaMesa";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reservar mesa",
  description: `Escolha sua mesa no mapa e reserve para a próxima ${site.nome} no ${site.casa.nome}, em ${site.cidade}.`,
  alternates: { canonical: "/reservar" },
};

export default async function Reservar() {
  // Sem a integração do WhatsApp o pedido nunca seria confirmado (a API recusa com 503): não mostra o formulário à toa.
  const reservaAberta = whatsappConfigurado();
  const edicoes = reservaAberta ? await edicoesReservaveis() : [];

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
          <ReservaMesa edicoes={edicoes} instagram={site.instagram} />
        )}
      </div>
    </section>
  );
}
