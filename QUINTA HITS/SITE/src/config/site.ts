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
    endereco: "", // preencher: rua, número
    bairro: "",
    instagram: "", // preencher sem @
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Florindos+Bar+Uberl%C3%A2ndia+MG",
  },

  // Redes
  instagram: "quintahits",

  // Playlist oficial no Spotify (seleção rock pop anos 2000). Precisa ser PÚBLICA para tocar no site.
  spotifyPlaylistId: "0Z88nUw6Gmm3zhX0pbAQWU",

  // Reserva de mesa: link atual da operação. Enquanto vazio, o botão leva ao Instagram.
  reservaUrl: process.env.NEXT_PUBLIC_RESERVA_URL ?? "",

  // Horário padrão de início (texto livre, ex.: "20h"). Vazio = não exibe.
  horarioPadrao: "",

  empresa: "GIBSON PROMOÇÕES",
  hashtagEmpresa: "#GibsonPromoções",
  hashtags: ["#QuintaHits", "#Uberlândia", "#MúsicaAoVivo", "#QuintaFeira"],
} as const;

export const instagramUrl = (handle: string) => `https://instagram.com/${handle.replace(/^@/, "")}`;

export const reservaHref = () => site.reservaUrl || instagramUrl(site.instagram);
