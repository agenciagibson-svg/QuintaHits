/**
 * Artistas com página própria no site (/artistas/<slug>): foto, estilo e agenda de shows abertos ao público.
 *
 * A agenda daqui é a do ARTISTA — inclui shows fora das casas da QUINTA HITS. Ela não entra na programação da marca
 * (que vem da tabela `edicoes`). Quando um show é uma noite da marca, `noite` aponta para a página dela (/noite/<id>).
 * Corporativos, aniversários e outros eventos fechados NÃO entram aqui.
 */

export type ShowArtista = {
  /** AAAA-MM-DD */
  data: string;
  cidade: string;
  uf: string;
  /** Casa/local, quando divulgado. */
  local?: string;
  /** Nome do evento, quando houver. */
  titulo?: string;
  /** Id da edição no banco quando o show é uma noite da QUINTA HITS (leva à página da noite e à reserva). */
  noite?: string;
};

export type Artista = {
  slug: string;
  nome: string;
  /** Estilo exibido na página (ex.: "Sertanejo"). */
  estilo: string;
  /** Caminho em /public. */
  foto: string;
  /** @ sem o "@"; vazio enquanto não confirmado. */
  instagram: string;
  agenda: ShowArtista[];
};

export const ARTISTAS: Artista[] = [
  {
    slug: "caua-alves",
    nome: "Cauã Alves",
    estilo: "Sertanejo",
    foto: "/artistas/caua-alves.jpg",
    instagram: "",
    // Agenda de dezembro/2026 (arte da Hits Promoções, 18/11/2026) — só os shows abertos.
    agenda: [
      { data: "2026-12-09", local: "Texas Bar", cidade: "Uberlândia", uf: "MG" },
      { data: "2026-12-11", cidade: "Itumbiara", uf: "GO" },
      { data: "2026-12-12", cidade: "Cachoeira Dourada", uf: "GO" },
      { data: "2026-12-18", cidade: "Ituiutaba", uf: "MG" },
      { data: "2026-12-26", local: "Fogo e Brasa", titulo: "Torresmo e Modão", cidade: "Caldas Novas", uf: "GO", noite: "2026-12-26_fogo-e-brasa" },
    ],
  },
];

export function artistaPorSlug(slug: string): Artista | undefined {
  return ARTISTAS.find((a) => a.slug === slug);
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Artista com página cujo nome bate com o da edição ("Cauã Alves" = "Caua Alves"). */
export function artistaPorNome(nome: string): Artista | undefined {
  if (!nome) return undefined;
  const n = normalizar(nome);
  return ARTISTAS.find((a) => normalizar(a.nome) === n);
}

/** Shows de hoje em diante, em ordem de data. `hoje` em AAAA-MM-DD. */
export function proximosShows(artista: Artista, hoje: string): ShowArtista[] {
  return artista.agenda.filter((s) => s.data >= hoje).sort((a, b) => a.data.localeCompare(b.data));
}
