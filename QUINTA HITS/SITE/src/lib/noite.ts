import "server-only";
import { todasEdicoes } from "@/lib/programacao";
import { getSiteConfig } from "@/lib/siteConfig";
import { dadosDaCasa, mapsUrlDe } from "@/lib/casasDados";
import { edicaoProntaParaSite } from "@/lib/regras";
import { estadoDasReservasDoSite } from "@/lib/reservasSite";
import { hojeISO, inicioDaEdicao, type Edicao } from "@/lib/edicao";
import { CASAS, CASA_PADRAO, edicaoIdValido, ehCasa, type Casa } from "@/config/casas";

/** Quanto dura uma noite no calendário do cliente ("adicionar à agenda"). */
const DURACAO_MS = 4 * 60 * 60 * 1000;

export type Noite = {
  edicao: Edicao;
  casa: Casa;
  /** Nome do lugar (Quinta Hits: o local da edição, ex.: Florindos Bar; outra casa: a própria casa). */
  lugar: string;
  endereco: string;
  mapsUrl: string | null;
  inicio: Date;
  fim: Date;
  /** Sem horário cadastrado (nem padrão): na agenda do cliente vira evento do dia inteiro. */
  temHorario: boolean;
  passou: boolean;
  /** aberta = dá para reservar agora; em_breve = casa com reserva, noite ainda não liberada; sem = casa sem reserva pelo site. */
  reserva: "aberta" | "em_breve" | "sem";
};

/** Página da noite (/noite/<id da edição>): a edição de qualquer casa, com onde, quando e se dá para reservar. */
export async function lerNoite(id: string, agora = new Date()): Promise<Noite | null> {
  if (!edicaoIdValido(id)) return null;
  const edicao = (await todasEdicoes()).find((e) => e.id === id);
  if (!edicao) return null;
  const casa = CASAS[ehCasa(edicao.casa) ? edicao.casa : CASA_PADRAO];
  const cfg = await getSiteConfig();
  let lugar: string;
  let endereco: string;
  let mapsUrl: string | null;
  if (casa.id === CASA_PADRAO) {
    lugar = edicao.local || cfg.casa.nome;
    endereco = [cfg.casa.endereco, cfg.casa.bairro, `${cfg.cidade}/${cfg.uf}`].filter(Boolean).join(" — ");
    mapsUrl = cfg.casa.mapsUrl || null;
  } else {
    const d = await dadosDaCasa(casa.id);
    lugar = casa.nome;
    endereco = [d.endereco, d.bairro, d.cidade].filter(Boolean).join(" — ");
    mapsUrl = mapsUrlDe(d, casa.nome);
  }
  const horario = edicao.horario || cfg.horarioPadrao;
  const inicio = inicioDaEdicao(edicao.data, edicao.horario, cfg.horarioPadrao);
  const passou = edicao.data < hojeISO(agora) || edicao.status === "realizada";
  let reserva: Noite["reserva"] = "sem";
  if (casa.reservas && !passou && edicao.status !== "cancelada") {
    const aberta = estadoDasReservasDoSite(casa.id).aberto && !!(await edicaoProntaParaSite(id, agora).catch(() => null));
    reserva = aberta ? "aberta" : "em_breve";
  }
  return { edicao, casa, lugar, endereco, mapsUrl, inicio, fim: new Date(inicio.getTime() + DURACAO_MS), temHorario: !!horario, passou, reserva };
}

const dataUtc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const diaSeguinte = (iso: string) => new Date(Date.parse(`${iso}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const semTracos = (iso: string) => iso.replace(/-/g, "");

/** Título do evento na agenda do cliente: "Voo Livre · Harley Grill". */
export const tituloDaNoite = (n: Noite) => `${n.edicao.artista || "QUINTA HITS"} · ${n.lugar}`;

/** "Adicionar ao Google Agenda" (abre o Google Agenda com o evento preenchido). */
export function linkGoogleAgenda(n: Noite, url: string): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: tituloDaNoite(n),
    dates: n.temHorario ? `${dataUtc(n.inicio)}/${dataUtc(n.fim)}` : `${semTracos(n.edicao.data)}/${semTracos(diaSeguinte(n.edicao.data))}`,
    details: `QUINTA HITS${n.edicao.tema ? ` — ${n.edicao.tema}` : ""}. Reserve sua mesa: ${url}`,
    location: [n.lugar, n.endereco].filter(Boolean).join(", "),
    ctz: "America/Sao_Paulo",
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

const escaparIcs = (t: string) => t.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** Arquivo .ics (iPhone, Outlook, qualquer agenda), com lembrete 3 horas antes. */
export function icsDaNoite(n: Noite, url: string): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//QUINTA HITS//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${n.edicao.id}@quintahits.com.br`,
    `DTSTAMP:${dataUtc(new Date())}`,
    ...(n.temHorario
      ? [`DTSTART:${dataUtc(n.inicio)}`, `DTEND:${dataUtc(n.fim)}`]
      : [`DTSTART;VALUE=DATE:${semTracos(n.edicao.data)}`, `DTEND;VALUE=DATE:${semTracos(diaSeguinte(n.edicao.data))}`]),
    `SUMMARY:${escaparIcs(tituloDaNoite(n))}`,
    `LOCATION:${escaparIcs([n.lugar, n.endereco].filter(Boolean).join(", "))}`,
    `DESCRIPTION:${escaparIcs(`QUINTA HITS${n.edicao.tema ? ` — ${n.edicao.tema}` : ""}. Reserve sua mesa: ${url}`)}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT3H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escaparIcs(`Hoje tem ${tituloDaNoite(n)}`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
