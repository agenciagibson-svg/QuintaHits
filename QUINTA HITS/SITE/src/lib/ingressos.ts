import "server-only";
import { randomInt } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hojeISO } from "@/lib/edicao";
import { CASAS, casaDaEdicaoId, dataDaEdicaoId, type Casa } from "@/config/casas";

/**
 * INGRESSO INDIVIDUAL (sem mesa), separado das reservas de mesa. Combinado com a equipe (17/11/2026):
 * - o cliente pede no site e já sai CONFIRMADO, com QR de entrada (/ingresso/<id>); paga na portaria;
 * - a mesa já inclui a entrada de quem senta nela (quem reserva mesa não compra ingresso);
 * - a venda para quando ingressos + pessoas das reservas de mesa chegam à capacidade máxima da noite.
 * Só vende na noite cujas regras têm `ingresso_centavos` (NULL = noite só de mesas, como sempre).
 * A emissão é a função `emitir_ingresso` do banco: trava por noite, ninguém passa da lotação.
 */

export const MAX_INGRESSOS_POR_PEDIDO = 10;
/** Pedidos de ingresso do mesmo WhatsApp na mesma noite. */
export const MAX_PEDIDOS_INGRESSO_POR_WHATSAPP = 3;

export type StatusIngresso = "confirmado" | "cancelado";

export type Ingresso = {
  id: string;
  edicao_id: string;
  nome: string;
  whatsapp: string;
  quantidade: number;
  valor_unitario_centavos: number;
  codigo: string;
  status: StatusIngresso;
  chegou_em: string | null;
  checkin_por: string | null;
  created_at: string;
};

export const CAMPOS_INGRESSO = "id, edicao_id, nome, whatsapp, quantidade, valor_unitario_centavos, codigo, status, chegou_em, checkin_por, created_at";

/** A tabela ou a coluna da migração de ingressos ainda não existe neste banco? */
export const semMigracaoDeIngressos = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST204" || e.code === "PGRST205" || e.code === "PGRST202" || /ingresso/i.test(e.message ?? ""));

/** Venda de ingressos da noite: valor e quantos ainda cabem. null = a noite não vende ingresso (ou sem a migração). */
export async function vendaDeIngressos(edicaoId: string): Promise<{ valorCentavos: number; restantes: number | null } | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("edicoes_regras").select("ingresso_centavos, capacidade_maxima").eq("edicao_id", edicaoId).maybeSingle();
  if (error || !data) return null;
  const r = data as { ingresso_centavos: number | null; capacidade_maxima: number | null };
  if (r.ingresso_centavos === null || r.ingresso_centavos === undefined) return null;
  if (r.capacidade_maxima === null) return { valorCentavos: r.ingresso_centavos, restantes: null };
  const [ing, res] = await Promise.all([
    db.from("ingressos").select("quantidade").eq("edicao_id", edicaoId).eq("status", "confirmado"),
    db.from("reservas").select("pessoas, whatsapp").eq("edicao_id", edicaoId).in("status", ["aguardando", "confirmada"]),
  ]);
  if (ing.error || res.error) return null;
  const ocupados =
    ((ing.data ?? []) as { quantidade: number }[]).reduce((t, l) => t + l.quantidade, 0) +
    ((res.data ?? []) as { pessoas: number; whatsapp: string }[]).filter((l) => l.whatsapp !== "").reduce((t, l) => t + l.pessoas, 0);
  return { valorCentavos: r.ingresso_centavos, restantes: Math.max(r.capacidade_maxima - ocupados, 0) };
}

export type ResultadoEmissao =
  | { ok: true; id: string; codigo: string }
  | { ok: false; motivo: "indisponivel" | "lotado"; restantes?: number };

/** Emite o ingresso (já confirmado). Código no formato da casa (ex.: FB-482193), único na noite. */
export async function emitirIngresso(dados: { edicaoId: string; nome: string; whatsapp: string; quantidade: number; ipHash: string | null }): Promise<ResultadoEmissao> {
  const casa = casaDaEdicaoId(dados.edicaoId);
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const codigo = `${CASAS[casa].prefixoCodigo}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
    const { data, error } = await supabaseAdmin().rpc("emitir_ingresso", {
      p_edicao: dados.edicaoId,
      p_nome: dados.nome,
      p_whatsapp: dados.whatsapp,
      p_quantidade: dados.quantidade,
      p_codigo: codigo,
      p_ip_hash: dados.ipHash,
    });
    if (error?.code === "23505") continue; // código repetido na noite: tenta outro
    if (error && /ingresso_indisponivel/.test(error.message)) return { ok: false, motivo: "indisponivel" };
    if (error && /lotado/.test(error.message)) {
      const restantes = Number((error as { details?: string }).details);
      return { ok: false, motivo: "lotado", ...(Number.isFinite(restantes) ? { restantes } : {}) };
    }
    if (error) throw error;
    return { ok: true, id: String(data), codigo };
  }
  throw new Error("Não foi possível gerar um código de ingresso livre.");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MeuIngresso = {
  id: string;
  casa: Casa;
  data: string;
  primeiroNome: string;
  quantidade: number;
  totalCentavos: number;
  valorUnitarioCentavos: number;
  codigo: string;
  status: StatusIngresso;
  chegou_em: string | null;
  artista: string;
  tema: string;
  horario: string;
  passou: boolean;
  valeQr: boolean;
};

/** Dados da página do cliente (/ingresso/<id>). O id (aleatório, impossível de adivinhar) é o próprio link. */
export async function lerMeuIngresso(id: string): Promise<MeuIngresso | null> {
  if (!UUID_RE.test(id)) return null;
  const db = supabaseAdmin();
  const { data, error } = await db.from("ingressos").select(CAMPOS_INGRESSO).eq("id", id.toLowerCase()).maybeSingle();
  if (error || !data) return null;
  const i = data as Ingresso;
  const { data: ed } = await db.from("edicoes").select("artista, tema, horario").eq("id", i.edicao_id).maybeSingle();
  const e = (ed ?? {}) as { artista?: string; tema?: string; horario?: string };
  const dataNoite = dataDaEdicaoId(i.edicao_id);
  const passou = dataNoite < hojeISO();
  return {
    id: i.id,
    casa: CASAS[casaDaEdicaoId(i.edicao_id)],
    data: dataNoite,
    primeiroNome: i.nome.trim().split(/\s+/)[0] || i.nome,
    quantidade: i.quantidade,
    valorUnitarioCentavos: i.valor_unitario_centavos,
    totalCentavos: i.quantidade * i.valor_unitario_centavos,
    codigo: i.codigo,
    status: i.status,
    chegou_em: i.chegou_em,
    artista: e.artista ?? "",
    tema: e.tema ?? "",
    horario: e.horario ?? "",
    passou,
    valeQr: !passou && !i.chegou_em && i.status === "confirmado",
  };
}
