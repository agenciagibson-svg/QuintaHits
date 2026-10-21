/**
 * Casas atendidas pelo sistema de reservas — configuração única, sem acesso a banco (segura para client).
 *
 * A Quinta Hits (Florindos Bar) é a casa original: tudo o que já existia continua sendo dela (`casa = 'quinta-hits'`
 * no banco), com o site, a programação, o app da casa e o WhatsApp. As outras casas usam o mesmo motor de reserva
 * (mapa, regras, prazos, painel), cada uma com as próprias mesas, edições e planta, e uma página própria.
 */

export type CasaId = "quinta-hits" | "harley-grill" | "solarium";

export const CASA_PADRAO: CasaId = "quinta-hits";

export type MapaDaCasa = {
  /** Largura ÷ altura do mapa. */
  proporcao: number;
  /** Imagem da planta ao fundo (em /public). Sem imagem = fundo quadriculado com os elementos desenhados no painel. */
  fundo: string | null;
  /** Tamanho fixo da mesa em % da largura do mapa (planta densa). null = tamanho conforme os lugares (padrão). */
  tamanhoMesa: number | null;
  /** Largura mínima do mapa em px: abaixo disso ele rola para o lado (muitas mesas pequenas no celular). */
  larguraMinima: number | null;
  /** Área com cor própria no mapa e na legenda (ex.: as mesas azuis da planta, "Pista VIP"). */
  destaque: { area: string; rotulo: string } | null;
};

export type Casa = {
  id: CasaId;
  /** Nome que o cliente vê. */
  nome: string;
  /** Nome curto no painel. */
  rotulo: string;
  /** Local padrão de uma edição nova. */
  local: string;
  /** Endereço público da página de reserva da casa. */
  pagina: string;
  /** Prefixo do código do pedido (ex.: QH-482193). Só o QH confirma pelo WhatsApp automático. */
  prefixoCodigo: string;
  /** Como a casa chama cada data no texto ("noite"). */
  noite: string;
  /** O nome com a preposição, para as mensagens ("na QUINTA HITS", "no Harley Grill"). */
  naCasa: string;
  /** Edição só pode cair numa quinta-feira? */
  soQuinta: boolean;
  /** Reserva de mesa pelo site? false = a casa aparece no site (agenda e "Onde"), mas sem mapa nem botão de reserva. */
  reservas: boolean;
  mapa: MapaDaCasa;
};

export const CASAS: Record<CasaId, Casa> = {
  "quinta-hits": {
    id: "quinta-hits",
    nome: "QUINTA HITS",
    rotulo: "Quinta Hits · Florindos",
    local: "Florindos Bar",
    pagina: "/reservar",
    prefixoCodigo: "QH",
    noite: "noite",
    naCasa: "na QUINTA HITS",
    // A QUINTA HITS virou marca (out/2026): eventos em qualquer dia da semana.
    soQuinta: false,
    reservas: true,
    mapa: { proporcao: 4 / 3, fundo: null, tamanhoMesa: null, larguraMinima: null, destaque: null },
  },
  "harley-grill": {
    id: "harley-grill",
    nome: "Harley Grill",
    rotulo: "Harley Grill",
    local: "Harley Grill",
    pagina: "/harley-grill",
    prefixoCodigo: "HG",
    noite: "noite",
    naCasa: "no Harley Grill",
    soQuinta: false,
    reservas: true,
    // Mapa redesenhado a partir da planta da casa, só com o que importa ao cliente (palco no lugar da logo, entrada,
    // setores, bar, banheiros). Os setores são elementos do salão, editáveis no painel (Mesas). As mesas azuis da
    // planta são a Pista VIP (área "Pista VIP" no cadastro das mesas).
    mapa: {
      proporcao: 1.4637,
      fundo: null,
      tamanhoMesa: 3,
      larguraMinima: 900,
      destaque: { area: "Pista VIP", rotulo: "Pista VIP" },
    },
  },
  solarium: {
    id: "solarium",
    nome: "Solarium Beach Bar",
    rotulo: "Solarium Beach Bar",
    local: "Solarium Beach Bar",
    pagina: "/solarium",
    prefixoCodigo: "SB",
    noite: "noite",
    naCasa: "no Solarium Beach Bar",
    soQuinta: false,
    // Ainda sem mapa (21/10/2026): entra na agenda e na seção "Onde", sem reserva pelo site. Quando o mapa chegar:
    // reservas: true e criar src/app/solarium/page.tsx (igual ao do Harley).
    reservas: false,
    mapa: { proporcao: 4 / 3, fundo: null, tamanhoMesa: null, larguraMinima: null, destaque: null },
  },
};

/** Outras casas além da padrão, na ordem em que aparecem no site ("Onde"). */
export const OUTRAS_CASAS = (Object.keys(CASAS) as CasaId[]).filter((c) => c !== CASA_PADRAO);

export const CASA_IDS = Object.keys(CASAS) as CasaId[];

export const ehCasa = (v: unknown): v is CasaId => typeof v === "string" && (CASA_IDS as string[]).includes(v);

/** Casa vinda de um parâmetro (?casa=): ausente = Quinta Hits; valor desconhecido = null (recusar). */
export function casaDoParametro(v: string | null | undefined): CasaId | null {
  if (v === null || v === undefined || v === "") return CASA_PADRAO;
  return ehCasa(v) ? v : null;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(iso: string): boolean {
  if (!DATA_RE.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === iso;
}

/**
 * Id da edição: Quinta Hits = 'AAAA-MM-DD' (como sempre); outras casas = 'AAAA-MM-DD_<casa>'.
 * O id sempre COMEÇA pela data: comparar ids com uma data (de hoje em diante, já passou) continua certo.
 */
export const edicaoIdDe = (casa: CasaId, data: string): string => (casa === CASA_PADRAO ? data : `${data}_${casa}`);

/** Casa e data de um id de edição válido; null para qualquer outra coisa. */
export function lerEdicaoId(id: unknown): { casa: CasaId; data: string } | null {
  if (typeof id !== "string") return null;
  const data = id.slice(0, 10);
  if (!dataValida(data)) return null;
  if (id.length === 10) return { casa: CASA_PADRAO, data };
  const resto = id.slice(10);
  if (!resto.startsWith("_")) return null;
  const casa = resto.slice(1);
  return ehCasa(casa) && casa !== CASA_PADRAO ? { casa, data } : null;
}

export const edicaoIdValido = (id: unknown): id is string => lerEdicaoId(id) !== null;

/** Casa da edição pelo id (id inválido = Quinta Hits, o comportamento de sempre). */
export const casaDaEdicaoId = (id: string): CasaId => lerEdicaoId(id)?.casa ?? CASA_PADRAO;

/** Data (AAAA-MM-DD) da edição pelo id. */
export const dataDaEdicaoId = (id: string): string => id.slice(0, 10);

/**
 * Domínio próprio de uma casa. `DOMINIOS_CASAS` (Vercel) no formato "dominio=casa", separados por vírgula:
 *   DOMINIOS_CASAS="reservas.harleygrill.com.br=harley-grill,www.harleygrill.com.br=harley-grill"
 * Sem a variável (ou domínio não listado) = site da Quinta Hits, como sempre. A porta (":3000") é ignorada.
 */
export function casaDoDominio(host: string | null | undefined, config: string | undefined): CasaId | null {
  if (!host || !config) return null;
  const alvo = host.trim().toLowerCase().replace(/:\d+$/, "");
  for (const par of config.split(",")) {
    const [dominio, casa] = par.split("=").map((p) => p?.trim().toLowerCase());
    if (dominio && dominio === alvo && ehCasa(casa)) return casa;
  }
  return null;
}

/** Páginas próprias das outras casas (fora do site da Quinta Hits: sem o cabeçalho, a faixa e o rodapé dela). */
export const PAGINAS_DE_OUTRAS_CASAS = CASA_IDS.filter((c) => c !== CASA_PADRAO && CASAS[c].reservas).map((c) => CASAS[c].pagina);

export const ehPaginaDeOutraCasa = (caminho: string | null | undefined): boolean =>
  !!caminho && PAGINAS_DE_OUTRAS_CASAS.some((p) => caminho === p || caminho.startsWith(`${p}/`));
