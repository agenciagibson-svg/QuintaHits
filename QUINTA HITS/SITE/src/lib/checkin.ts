import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hojeISO } from "@/lib/edicao";
import { registrarAuditoria } from "@/lib/auditoria";
import { CASAS, CASA_IDS, casaDaEdicaoId, dataDaEdicaoId, type CasaId } from "@/config/casas";
import type { StatusReserva } from "@/lib/reserva";

/**
 * CHECK-IN NA ENTRADA. Cada reserva tem um QR (página /minha-reserva/<id>) que leva a /casa/checkin/<id>; na porta,
 * a equipe lê o QR (ou digita o código, ex.: HG-482193) e a reserva ganha `chegou_em`. Numa noite em que a porta fez
 * check-in, quem não chegar até o fim da tolerância vira "não compareceu" e solta a mesa (marcarNaoComparecimentos).
 */

const UUID_EM_TEXTO = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** Prefixo opcional (QH, HG...) e os 6 dígitos. Aceita "HG-482193", "hg 482193", "482193". */
const CODIGO_RE = /^\s*(?:([a-z]{2})\s*-?\s*)?(\d{6})\s*$/i;

export const somarDias = (iso: string, dias: number): string => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
};

/**
 * Noites em que dá para fazer check-in agora: a de hoje e, de madrugada (até as 8h), a de ontem (a noite passa da
 * meia-noite). Datas AAAA-MM-DD no horário de Uberlândia.
 */
export function noitesEmAndamento(agora = new Date()): string[] {
  const hoje = hojeISO(agora);
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(agora));
  return hora < 8 ? [somarDias(hoje, -1), hoje] : [hoje];
}

/** O que veio do QR ou foi digitado: id da reserva (QR, link) ou código. null = não dá para entender. */
export function lerReferencia(ref: unknown): { id: string } | { codigo: string; prefixo: string | null } | null {
  if (typeof ref !== "string" || ref.length > 500) return null;
  const uuid = ref.match(UUID_EM_TEXTO);
  if (uuid) return { id: uuid[0].toLowerCase() };
  const c = ref.match(CODIGO_RE);
  if (c) return { codigo: c[2], prefixo: c[1] ? c[1].toUpperCase() : null };
  return null;
}

export type ReservaNaPorta = {
  id: string;
  edicao_id: string;
  casa: CasaId;
  casaNome: string;
  data: string;
  mesa: string;
  nome: string;
  pessoas: number;
  status: StatusReserva;
  codigo: string | null;
  chegou_em: string | null;
};

export type ResultadoCheckin =
  | { ok: true; reserva: ReservaNaPorta; jaTinhaChegado: boolean }
  | { ok: false; status: number; erro: string; reserva?: ReservaNaPorta };

type Linha = { id: string; edicao_id: string; mesa_id: string; nome: string; whatsapp: string; pessoas: number; status: StatusReserva; codigo: string | null; chegou_em: string | null; origem_reserva?: string };
const CAMPOS = "id, edicao_id, mesa_id, nome, whatsapp, pessoas, status, codigo, chegou_em, origem_reserva";

async function paraPorta(l: Linha): Promise<ReservaNaPorta> {
  const { data } = await supabaseAdmin().from("mesas").select("numero").eq("id", l.mesa_id).maybeSingle();
  const casa = casaDaEdicaoId(l.edicao_id);
  return {
    id: l.id,
    edicao_id: l.edicao_id,
    casa,
    casaNome: CASAS[casa].nome,
    data: dataDaEdicaoId(l.edicao_id),
    mesa: (data as { numero?: string } | null)?.numero ?? "?",
    nome: l.nome,
    pessoas: l.pessoas,
    status: l.status,
    codigo: l.codigo,
    chegou_em: l.chegou_em,
  };
}

/**
 * Acha a reserva do QR/código entre as casas permitidas. Pelo código, só nas noites em andamento (o código de 6 dígitos
 * pode repetir entre noites); pelo id (QR), qualquer noite — quem decide se ainda dá é `registrarChegada`.
 */
async function encontrar(ref: unknown, casas: readonly CasaId[], agora: Date): Promise<{ linha: Linha } | { status: number; erro: string }> {
  const lida = lerReferencia(ref);
  if (!lida) return { status: 400, erro: "Não entendi o código. Leia o QR da reserva ou digite o código (ex.: HG-482193)." };
  const db = supabaseAdmin();
  let linhas: Linha[] = [];
  if ("id" in lida) {
    const { data, error } = await db.from("reservas").select(CAMPOS).eq("id", lida.id).maybeSingle();
    if (error) throw error;
    if (data) linhas = [data as unknown as Linha];
  } else {
    const prefixos = CASA_IDS.filter((c) => casas.includes(c)).map((c) => CASAS[c].prefixoCodigo);
    const codigos = lida.prefixo ? (prefixos.includes(lida.prefixo) ? [`${lida.prefixo}-${lida.codigo}`] : []) : prefixos.map((p) => `${p}-${lida.codigo}`);
    if (codigos.length) {
      const noites = noitesEmAndamento(agora);
      const { data, error } = await db.from("reservas").select(CAMPOS).in("codigo", codigos).gte("edicao_id", noites[0]).lt("edicao_id", somarDias(noites[noites.length - 1], 1));
      if (error) throw error;
      linhas = ((data ?? []) as unknown as Linha[]).filter((l) => l.status !== "cancelada" && l.status !== "expirada");
    }
  }
  linhas = linhas.filter((l) => casas.includes(casaDaEdicaoId(l.edicao_id)));
  if (linhas.length === 0) return { status: 404, erro: "Reserva não encontrada para esta noite." };
  if (linhas.length > 1) return { status: 409, erro: "Esse código bate com mais de uma reserva. Leia o QR da reserva." };
  return { linha: linhas[0] };
}

/**
 * Registra a chegada. `acao`: "chegou" (padrão), "desfazer" (tirou o check-in por engano) ou "nao_veio" (solta a mesa).
 * `qualquerNoite`: o painel pode corrigir noites passadas; o app da casa só mexe nas noites em andamento.
 */
export async function registrarChegada(
  ref: unknown,
  ator: string,
  opcoes: { casas: readonly CasaId[]; acao?: "chegou" | "desfazer" | "nao_veio"; qualquerNoite?: boolean; agora?: Date },
): Promise<ResultadoCheckin> {
  const agora = opcoes.agora ?? new Date();
  const acao = opcoes.acao ?? "chegou";
  const achada = await encontrar(ref, opcoes.casas, agora);
  if (!("linha" in achada)) return { ok: false, status: achada.status, erro: achada.erro };
  const l = achada.linha;
  const reserva = await paraPorta(l);

  if (l.origem_reserva === "admin" && l.whatsapp === "") return { ok: false, status: 409, erro: `A mesa ${reserva.mesa} está travada nesta noite (não é reserva de cliente).`, reserva };
  const data = dataDaEdicaoId(l.edicao_id);
  if (!opcoes.qualquerNoite && !noitesEmAndamento(agora).includes(data)) {
    return { ok: false, status: 409, erro: data > hojeISO(agora) ? `Essa reserva é para o dia ${data.slice(8, 10)}/${data.slice(5, 7)}, não para hoje.` : "Essa noite já passou.", reserva };
  }
  if (opcoes.qualquerNoite && data > hojeISO(agora)) return { ok: false, status: 409, erro: "Essa noite ainda não chegou.", reserva };
  if (l.status === "cancelada" || l.status === "expirada") {
    return { ok: false, status: 409, erro: l.status === "cancelada" ? "Essa reserva foi cancelada." : "Esse pedido expirou sem confirmação.", reserva };
  }

  const db = supabaseAdmin();
  const quando = agora.toISOString();
  let campos: Record<string, unknown>;
  if (acao === "chegou") {
    // QR vale uma entrada só: a segunda leitura não registra nada e a porta vê "QR já usado" (com a hora da primeira).
    if (l.status === "confirmada" && l.chegou_em) {
      await registrarAuditoria({ ator, acao: "checkin_repetido", entidade: "reserva", entidadeId: l.id, detalhe: { edicao: l.edicao_id, mesa: reserva.mesa } });
      return { ok: true, reserva, jaTinhaChegado: true };
    }
    // Pedido ainda aguardando ou marcado como "não veio": quem está na porta decide, a chegada confirma a mesa.
    campos = { status: "confirmada", chegou_em: quando, checkin_por: ator, ...(l.status !== "confirmada" ? { confirmada_em: quando } : {}) };
  } else if (acao === "desfazer") {
    campos = { chegou_em: null, checkin_por: null };
  } else {
    if (l.chegou_em) return { ok: false, status: 409, erro: "Essa reserva já fez check-in.", reserva };
    if (l.status !== "confirmada") return { ok: false, status: 409, erro: "Só reserva confirmada pode ser marcada como não compareceu.", reserva };
    campos = { status: "nao_compareceu" };
  }
  const { data: nova, error } = await db.from("reservas").update({ ...campos, updated_at: quando }).eq("id", l.id).select(CAMPOS).maybeSingle();
  // Voltar uma reserva "não veio" quando a mesa já foi dada a outra pessoa.
  if (error?.code === "23505") return { ok: false, status: 409, erro: `A mesa ${reserva.mesa} já foi ocupada por outra reserva. Acomode o cliente em outra mesa pelo painel.`, reserva };
  if (error) throw error;
  await registrarAuditoria({ ator, acao: acao === "chegou" ? "checkin" : acao === "desfazer" ? "checkin_desfeito" : "nao_compareceu", entidade: "reserva", entidadeId: l.id, detalhe: { edicao: l.edicao_id, mesa: reserva.mesa } });
  return { ok: true, reserva: await paraPorta(nova as unknown as Linha), jaTinhaChegado: false };
}

/** Só uma passada por minuto por instância: roda junto de toda leitura de reservas (não há tarefa agendada). */
let ultimaPassada = 0;
export const _reiniciarPassadaNaoComparecimento = () => {
  ultimaPassada = 0;
};

/**
 * Libera a mesa de quem não chegou: reserva confirmada de cliente, sem check-in, numa noite EM QUE A PORTA FEZ CHECK-IN
 * (ao menos uma chegada registrada), depois de abertura + tolerância (regras da noite). Noite sem check-in nenhum não é
 * tocada (a casa não está usando o QR). Nunca lança erro: banco sem a migração do check-in só não faz nada.
 */
export async function marcarNaoComparecimentos(agora = new Date()): Promise<number> {
  if (agora.getTime() - ultimaPassada < 60_000) return 0;
  ultimaPassada = agora.getTime();
  try {
    const db = supabaseAdmin();
    const noites = noitesEmAndamento(agora);
    const desde = somarDias(noites[0], -1);
    const ate = somarDias(hojeISO(agora), 1);
    const { data, error } = await db.from("reservas").select("id, edicao_id, whatsapp, chegou_em, status").in("status", ["confirmada"]).gte("edicao_id", desde).lt("edicao_id", ate);
    if (error || !data?.length) return 0;
    const linhas = data as { id: string; edicao_id: string; whatsapp: string; chegou_em: string | null }[];
    const comCheckin = new Set(linhas.filter((l) => l.chegou_em).map((l) => l.edicao_id));
    const pendentes = linhas.filter((l) => !l.chegou_em && l.whatsapp !== "" && comCheckin.has(l.edicao_id));
    if (!pendentes.length) return 0;
    const edicoes = [...new Set(pendentes.map((l) => l.edicao_id))];
    const { data: regras } = await db.from("edicoes_regras").select("edicao_id, abertura, tolerancia_min").in("edicao_id", edicoes);
    const prazo = new Map<string, number>();
    for (const r of (regras ?? []) as { edicao_id: string; abertura: string | null; tolerancia_min: number | null }[]) {
      const m = r.abertura?.match(/^(\d{1,2})h(\d{2})?$/);
      if (!m || r.tolerancia_min === null) continue;
      const inicio = Date.parse(`${dataDaEdicaoId(r.edicao_id)}T${m[1].padStart(2, "0")}:${m[2] ?? "00"}:00-03:00`);
      prazo.set(r.edicao_id, inicio + r.tolerancia_min * 60_000);
    }
    const vencidas = pendentes.filter((l) => prazo.has(l.edicao_id) && agora.getTime() > (prazo.get(l.edicao_id) as number)).map((l) => l.id);
    if (!vencidas.length) return 0;
    const { error: e2 } = await db.from("reservas").update({ status: "nao_compareceu", updated_at: agora.toISOString() }).in("id", vencidas).eq("status", "confirmada").is("chegou_em", null);
    if (e2) return 0;
    await registrarAuditoria({ ator: "sistema", acao: "nao_compareceu_automatico", entidade: "reserva", detalhe: { reservas: vencidas.length, edicoes } });
    return vencidas.length;
  } catch {
    return 0;
  }
}
