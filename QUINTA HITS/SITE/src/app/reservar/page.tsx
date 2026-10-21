import type { Metadata } from "next";
import { site, instagramUrl } from "@/config/site";
import { situacaoDoSite, type ProximaAbertura } from "@/lib/regras";
import { regrasPublicas } from "@/lib/regrasEdicao";
import { formatData } from "@/lib/edicao";
import { estadoDasReservasDoSite } from "@/lib/reservasSite";
import ReservaVariasCasas, { type NoiteAberta } from "@/components/ReservaVariasCasas";
import { CASAS, CASA_IDS, edicaoIdValido } from "@/config/casas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reservar mesa",
  description: `Escolha sua mesa no mapa e reserve para as próximas noites da ${site.nome} em ${site.cidade}.`,
  alternates: { canonical: "/reservar" },
};

/**
 * Todas as noites com reserva aberta, de TODAS as casas com reserva pelo site (Florindos, Harley Grill...), em ordem de
 * data. Cada casa segue as próprias regras: chave do site, noite completa e liberada no painel, prazo e abertura.
 * `?edicao=` abre direto numa noite (links da agenda).
 */
export default async function Reservar({ searchParams }: { searchParams: Promise<{ edicao?: string }> }) {
  const { edicao: pedida } = await searchParams;
  const casasComReserva = CASA_IDS.filter((c) => CASAS[c].reservas);
  const porCasa = await Promise.all(
    casasComReserva.map(async (casa) => {
      // Reserva desligada (RESERVAS_SITE_ENABLED) ou sem como confirmar: a API recusa, então a casa nem entra.
      const estado = estadoDasReservasDoSite(casa);
      if (!estado.aberto) return { casa, aberto: false, noites: [] as NoiteAberta[], proximaAbertura: null as ProximaAbertura | null };
      const { prontas, proximaAbertura } = await situacaoDoSite(new Date(), 6, casa).catch(() => ({ prontas: [], proximaAbertura: null }));
      const noites: NoiteAberta[] = prontas.map((p) => ({ casa, edicao: p.edicao, regras: regrasPublicas(p.regras), manual: estado.motivo === "manual" }));
      return { casa, aberto: true, noites, proximaAbertura };
    }),
  );
  const noites = porCasa.flatMap((c) => c.noites).sort((a, b) => a.edicao.data.localeCompare(b.edicao.data) || casasComReserva.indexOf(a.casa) - casasComReserva.indexOf(b.casa));
  const algumaAberta = porCasa.some((c) => c.aberto);
  const proximaAbertura = porCasa
    .map((c) => c.proximaAbertura)
    .filter((p): p is ProximaAbertura => !!p)
    .sort((a, b) => a.abreEm.localeCompare(b.abreEm))[0];

  return (
    <section className="secao secao--creme">
      <div className="wrap">
        <div className="cabeca">
          <div>
            <div className="eyebrow">Reserva de mesa</div>
            <h1 className="display h-1" style={{ margin: "6px 0 0" }}>Escolha sua mesa.</h1>
          </div>
        </div>
        {noites.length === 0 ? (
          <div className="vazio">
            <p>
              {!algumaAberta
                ? "As reservas pelo site abrem em breve. Por enquanto, fale com a gente no Instagram."
                : proximaAbertura
                  ? `As reservas do dia ${formatData(proximaAbertura.edicao.data, "numerica")} abrem ${proximaAbertura.descricao}.`
                  : "Ainda não abrimos reservas para as próximas noites."}
            </p>
            <a className="btn btn--terracota" href={instagramUrl(site.instagram)} target="_blank" rel="noopener noreferrer">
              Fale com a gente no Instagram
            </a>
          </div>
        ) : (
          <ReservaVariasCasas noites={noites} instagram={site.instagram} edicaoInicial={edicaoIdValido(pedida) ? pedida : undefined} />
        )}
      </div>
    </section>
  );
}
