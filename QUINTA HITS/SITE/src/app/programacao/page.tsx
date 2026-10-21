import type { Metadata } from "next";
import { alvoLink, site } from "@/config/site";
import { getSiteConfig, reservaHrefFrom } from "@/lib/siteConfig";
import { edicoesAnteriores, proximasEdicoes, temEdicaoHoje } from "@/lib/programacao";
import ProgramacaoFiltro from "@/components/ProgramacaoFiltro";
import Marquee from "@/components/Marquee";
import { AgendaDaCasa } from "@/components/OutraCasa";
import { proximosEventosDaCasa } from "@/lib/casasDados";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Programação",
  description: `Agenda da ${site.nome} em ${site.cidade}: próximas noites, artistas, estilos e reserva de mesa.`,
  alternates: { canonical: "/programacao" },
};

export default async function Programacao() {
  const agora = new Date();
  const cfg = await getSiteConfig();
  const proximas = await proximasEdicoes(agora, 6);
  const anteriores = await edicoesAnteriores(agora);
  const temHoje = await temEdicaoHoje(agora);
  const eventosHarley = await proximosEventosDaCasa("harley-grill", agora, 6);

  return (
    <>
      <section className="secao secao--creme">
        <div className="wrap">
          <div className="cabeca">
            <div>
              <div className="eyebrow">Programação</div>
              <h1 className="display h-1" style={{ margin: "6px 0 0" }}>Escolha sua noite.</h1>
            </div>
            <a className="btn btn--terracota" href={reservaHrefFrom(cfg)} {...alvoLink(reservaHrefFrom(cfg))}>
              Reservar mesa
            </a>
          </div>
          <ProgramacaoFiltro proximas={proximas} anteriores={anteriores} />
        </div>
      </section>
      {/* Harley Grill: agenda separada, com a reserva pelo mapa do Harley. */}
      <AgendaDaCasa casa="harley-grill" eventos={eventosHarley} titulo="Agenda do Harley Grill" />
      {/* Só afirma "hoje tem" quando hoje tem evento na agenda. */}
      <Marquee texto={temHoje ? "Hoje tem Quinta Hits." : cfg.assinatura} />
    </>
  );
}
