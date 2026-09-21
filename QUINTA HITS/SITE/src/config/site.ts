/**
 * QUINTA HITS — configuração única do site.
 * Tudo que muda de casa, link ou contato mora aqui. Nada disso é hard-coded nas páginas.
 */
export const site = {
  nome: "QUINTA HITS",
  slogan: "A quinta oficial de Uberlândia.",
  assinatura: "Se é quinta, tem Hits.",
  pontoDePartida: "Quinta já é quase sexta.",
  descricao:
    "Música, amigos, drinks e encontros. Toda quinta, no Florindos Bar, em Uberlândia. Programação e reservas.",
  cidade: "Uberlândia",
  uf: "MG",

  // URL pública do site (usada em metadata, OpenGraph e sitemap)
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://quinta-hits.vercel.app",

  // Casa atual da QUINTA HITS
  casa: {
    nome: "Florindos Bar",
    endereco: "Av. Francisco Galassi, 1551",
    bairro: "Morada da Colina",
    instagram: "", // preencher sem @
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Av.+Francisco+Galassi%2C+1551+-+Morada+da+Colina%2C+Uberl%C3%A2ndia+MG",
  },

  // Redes
  instagram: "quintahits",

  // Playlist oficial no Spotify (seleção rock/pop-rock dos anos 2000: Killers, Franz Ferdinand,
  // Kings of Leon, Foo Fighters, Green Day, The Strokes, Muse...). Editorial do próprio Spotify,
  // pública por padrão — não precisa de nenhuma configuração extra para tocar no site.
  spotifyPlaylistId: "37i9dQZF1DX3oM43CtKnRV",

  // Reserva de mesa: link externo da operação. Enquanto vazio, o botão leva ao mapa de mesas (/reservar).
  reservaUrl: process.env.NEXT_PUBLIC_RESERVA_URL ?? "",

  // Horário padrão de início (texto livre, ex.: "20h"). Vazio = não exibe.
  horarioPadrao: "",

  empresa: "GIBSON PROMOÇÕES",
  hashtagEmpresa: "#GibsonPromoções",
  hashtags: ["#QuintaHits", "#Uberlândia", "#MúsicaAoVivo", "#QuintaFeira"],
} as const;

export const instagramUrl = (handle: string) => `https://instagram.com/${handle.replace(/^@/, "")}`;

/** Página de reserva com mapa de mesas; um link externo cadastrado (reservaUrl) tem prioridade. */
export const RESERVA_PAGINA = "/reservar";

export const reservaHref = () => site.reservaUrl || RESERVA_PAGINA;

/** Link externo abre em nova aba; página do próprio site abre na mesma. */
export const alvoLink = (href: string) =>
  /^https?:\/\//.test(href) ? ({ target: "_blank", rel: "noopener noreferrer" } as const) : {};
