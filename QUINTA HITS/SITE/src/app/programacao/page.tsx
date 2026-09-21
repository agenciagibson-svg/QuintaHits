import type { Metadata } from "next";
import { alvoLink, site } from "@/config/site";
import { getSiteConfig, reservaHrefFrom } from "@/lib/siteConfig";
import { edicoesAnteriores, proximasEdicoes, temEdicaoHoje } from "@/lib/programacao";
import ProgramacaoFiltro from "@/components/ProgramacaoFiltro";
import Marquee from "@/components/Marquee";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Programação",
  description: `Calendário das próximas quintas da ${site.nome} no ${site.casa.nome}, em ${site.cidade}. Artistas, estilos e reservas.`,
  alternates: { canonical: "/programacao" },
};

export default async function Programacao() {
  const agora = new Date();
  const cfg = await getSiteConfig();
  const proximas = await proximasEdicoes(agora, 6);
  const anteriores = await edicoesAnteriores(agora);
  const temHoje = await temEdicaoHoje(agora);

  return (
    <>
      <section className="secao secao--creme">
        <div className="wrap">
          <div className="cabeca">
            <div>
              <div className="eyebrow">Programação</div>
              <h1 className="display h-1" style={{ margin: "6px 0 0" }}>Toda quinta. Sempre.</h1>
            </div>
            <a className="btn btn--terracota" href={reservaHrefFrom(cfg)} {...alvoLink(reservaHrefFrom(cfg))}>
              Reservar mesa
            </a>
          </div>
          <ProgramacaoFiltro proximas={proximas} anteriores={anteriores} />
        </div>
      </section>
      {/* Só afirma "hoje é quinta" quando hoje é mesmo quinta com edição. */}
      <Marquee texto={temHoje ? "Hoje é quinta. Tem Quinta Hits." : cfg.assinatura} />
    </>
  );
}
