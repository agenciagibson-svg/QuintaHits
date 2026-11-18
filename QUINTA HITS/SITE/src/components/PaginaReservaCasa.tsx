import type { Metadata } from "next";
import Link from "next/link";
import { CASAS, type CasaId } from "@/config/casas";
import { situacaoDoSite } from "@/lib/regras";
import { regrasPublicas } from "@/lib/regrasEdicao";
import { formatData } from "@/lib/edicao";
import { estadoDasReservasDoSite } from "@/lib/reservasSite";
import ReservaVariasCasas from "@/components/ReservaVariasCasas";
import { dadosDaCasa, mapsUrlDe } from "@/lib/casasDados";
import IngressoIndividual from "@/components/IngressoIndividual";
import { MAX_INGRESSOS_POR_PEDIDO, vendaDeIngressos } from "@/lib/ingressos";

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

export default async function PaginaReservaCasa({ casa, edicaoInicial }: { casa: CasaId; edicaoInicial?: string }) {
  const c = CASAS[casa];
  const estado = estadoDasReservasDoSite(casa);
  const { prontas, proximaAbertura } = estado.aberto ? await situacaoDoSite(new Date(), 6, casa) : { prontas: [], proximaAbertura: null };
  const edicoes = prontas.map((p) => p.edicao);
  const dados = await dadosDaCasa(casa);
  const mapa = mapsUrlDe(dados, c.nome);
  const endereco = [dados.endereco, dados.bairro, dados.cidade].filter(Boolean).join(" — ");
  // Noite aberta nesta tela (a mesma regra de ReservaVariasCasas): o ingresso individual, quando a noite vende, fica
  // num bloco próprio, separado do mapa de mesas.
  const noiteNaTela = edicoes.find((e) => e.id === edicaoInicial) ?? (edicoes.length === 1 ? edicoes[0] : null);
  const ingresso = noiteNaTela ? await vendaDeIngressos(noiteNaTela.id).catch(() => null) : null;

  return (
    <div className="pagina-casa">
      <header className="pagina-casa__topo">
        <div className="wrap pagina-casa__topo-in">
          <span className="pagina-casa__nome">{c.nome}</span>
          {/* Volta ao site da QUINTA HITS (home, agenda das noites e "Onde"). */}
          <Link className="btn btn--creme btn--p pagina-casa__voltar" href="/">
            ← Voltar ao site
          </Link>
        </div>
      </header>
      <section className="secao secao--creme pagina-casa__secao">
        <div className="wrap">
          <div className="cabeca">
            <div>
              <div className="eyebrow">{c.nome}</div>
              <h1 className="display h-1" style={{ margin: "6px 0 0" }}>{ingresso ? "Ingressos e mesas." : "Escolha sua mesa."}</h1>
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
            <>
            {ingresso && noiteNaTela && (
              <>
                <IngressoIndividual edicaoId={noiteNaTela.id} valorCentavos={ingresso.valorCentavos} restantes={ingresso.restantes} maximo={MAX_INGRESSOS_POR_PEDIDO} />
                <h2 className="display h-2 pagina-casa__mesas-titulo">Ou reserve uma mesa.</h2>
              </>
            )}
            <ReservaVariasCasas
              noites={prontas.map((p) => ({ casa, edicao: p.edicao, regras: regrasPublicas(p.regras), manual: true }))}
              instagram=""
              edicaoInicial={edicaoInicial}
            />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
