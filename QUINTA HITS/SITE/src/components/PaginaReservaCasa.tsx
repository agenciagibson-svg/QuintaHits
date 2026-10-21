import type { Metadata } from "next";
import { CASAS, type CasaId } from "@/config/casas";
import { situacaoDoSite } from "@/lib/regras";
import { regrasPublicas } from "@/lib/regrasEdicao";
import { formatData } from "@/lib/edicao";
import { estadoDasReservasDoSite } from "@/lib/reservasSite";
import ReservaMesa from "@/components/ReservaMesa";
import { dadosDaCasa, mapsUrlDe } from "@/lib/casasDados";

/**
 * Página de reserva de uma casa que não é a Quinta Hits (ex.: Harley Grill em /harley-grill e no domínio próprio).
 * Mesmo motor da /reservar: só edições da casa, completas, liberadas para o site e no prazo; pedido sempre no modo
 * formulário (a equipe confirma no painel). Sem cabeçalho, faixa nem rodapé da Quinta Hits (ver ForaDoAdmin).
 */
export function metadadosDaCasa(casa: CasaId): Metadata {
  const c = CASAS[casa];
  const titulo = `Reservar mesa — ${c.nome}`;
  const descricao = `Escolha sua mesa no mapa e peça a reserva no ${c.nome}.`;
  return {
    title: { absolute: titulo },
    description: descricao,
    alternates: { canonical: c.pagina },
    openGraph: { title: titulo, description: descricao, siteName: c.nome, url: c.pagina, type: "website", locale: "pt_BR" },
    twitter: { card: "summary", title: titulo, description: descricao },
  };
}

export default async function PaginaReservaCasa({ casa }: { casa: CasaId }) {
  const c = CASAS[casa];
  const estado = estadoDasReservasDoSite(casa);
  const { prontas, proximaAbertura } = estado.aberto ? await situacaoDoSite(new Date(), 6, casa) : { prontas: [], proximaAbertura: null };
  const edicoes = prontas.map((p) => p.edicao);
  const dados = await dadosDaCasa(casa);
  const mapa = mapsUrlDe(dados, c.nome);
  const endereco = [dados.endereco, dados.bairro, dados.cidade].filter(Boolean).join(" — ");

  return (
    <div className="pagina-casa">
      <header className="pagina-casa__topo">
        <div className="wrap pagina-casa__topo-in">
          <span className="pagina-casa__nome">{c.nome}</span>
          <span className="eyebrow">Reserva de mesa</span>
        </div>
      </header>
      <section className="secao secao--creme pagina-casa__secao">
        <div className="wrap">
          <div className="cabeca">
            <div>
              <div className="eyebrow">{c.nome}</div>
              <h1 className="display h-1" style={{ margin: "6px 0 0" }}>Escolha sua mesa.</h1>
              {(endereco || dados.quando) && (
                <p className="pagina-casa__endereco">
                  {[endereco, dados.quando].filter(Boolean).join(" · ")}
                  {mapa && (
                    <>
                      {" · "}
                      <a href={mapa} target="_blank" rel="noopener noreferrer">Abrir no mapa</a>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
          {edicoes.length === 0 ? (
            <div className="vazio">
              <p>
                {!estado.aberto
                  ? "As reservas pelo site abrem em breve."
                  : proximaAbertura
                    ? `As reservas de ${formatData(proximaAbertura.edicao.data, "numerica")} abrem ${proximaAbertura.descricao}.`
                    : "Ainda não abrimos reservas para os próximos eventos."}
              </p>
            </div>
          ) : (
            <ReservaMesa
              edicoes={edicoes}
              instagram=""
              casa={casa}
              manual
              regras={Object.fromEntries(prontas.map((p) => [p.edicao.id, regrasPublicas(p.regras)]))}
            />
          )}
        </div>
      </section>
    </div>
  );
}
