import "server-only";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hojeISO } from "@/lib/edicao";
import { expirarPedidosVencidos } from "@/lib/reservas";
import { CASAS, casaDaEdicaoId, dataDaEdicaoId, type Casa } from "@/config/casas";
import type { StatusReserva } from "@/lib/reserva";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Link curto da mensagem (/r/<12 hex>): os 12 primeiros caracteres do id, todos aleatórios (48 bits, impossível chutar). */
const CURTO_RE = /^[0-9a-f]{12}$/i;

/** "02a04ac5-9ebd-4065-…" → "02a04ac59ebd" (o que vai no link da mensagem). */
export const idCurto = (id: string): string => id.replace(/-/g, "").slice(0, 12).toLowerCase();

/** Id completo a partir do link curto (ou do id completo). Mais de uma reserva com o mesmo começo (nunca na prática): null. */
async function resolverId(ref: string): Promise<string | null> {
  if (UUID_RE.test(ref)) return ref.toLowerCase();
  if (!CURTO_RE.test(ref)) return null;
  const c = ref.toLowerCase();
  const base = `${c.slice(0, 8)}-${c.slice(8, 12)}`;
  const { data } = await supabaseAdmin().from("reservas").select("id").gte("id", `${base}-0000-0000-000000000000`).lte("id", `${base}-ffff-ffff-ffffffffffff`).limit(2);
  return data && data.length === 1 ? (data[0] as { id: string }).id : null;
}

export type MinhaReserva = {
  id: string;
  casa: Casa;
  data: string;
  mesa: string;
  primeiroNome: string;
  pessoas: number;
  status: StatusReserva;
  codigo: string | null;
  chegou_em: string | null;
  artista: string;
  horario: string;
  local: string;
  /** Noite já passou. */
  passou: boolean;
  /** Mostra o QR de entrada (confirmada ou aguardando, noite de hoje em diante, ainda sem check-in). */
  valeQr: boolean;
};

/**
 * Dados da página do cliente (/minha-reserva/<id>) e da imagem dela (prévia no WhatsApp). Só o necessário: primeiro
 * nome, mesa, pessoas, noite e casa. Mesa travada pela equipe (sem WhatsApp) não é reserva de cliente: null.
 */
export async function lerMinhaReserva(ref: string): Promise<MinhaReserva | null> {
  const id = await resolverId(ref);
  if (!id) return null;
  await expirarPedidosVencidos().catch(() => undefined);
  const db = supabaseAdmin();
  const { data } = await db.from("reservas").select("id, edicao_id, mesa_id, nome, whatsapp, pessoas, status, codigo, chegou_em").eq("id", id).maybeSingle();
  if (!data || (data as { whatsapp: string }).whatsapp === "") return null;
  const r = data as { id: string; edicao_id: string; mesa_id: string; nome: string; pessoas: number; status: StatusReserva; codigo: string | null; chegou_em: string | null };
  const [{ data: mesa }, { data: edicao }] = await Promise.all([
    db.from("mesas").select("numero").eq("id", r.mesa_id).maybeSingle(),
    db.from("edicoes").select("artista, horario, local").eq("id", r.edicao_id).maybeSingle(),
  ]);
  const ed = (edicao ?? {}) as { artista?: string; horario?: string; local?: string };
  const dataNoite = dataDaEdicaoId(r.edicao_id);
  const passou = dataNoite < hojeISO();
  return {
    id: r.id,
    casa: CASAS[casaDaEdicaoId(r.edicao_id)],
    data: dataNoite,
    mesa: (mesa as { numero?: string } | null)?.numero ?? "?",
    primeiroNome: r.nome.trim().split(/\s+/)[0] || r.nome,
    pessoas: r.pessoas,
    status: r.status,
    codigo: r.codigo,
    chegou_em: r.chegou_em,
    artista: ed.artista ?? "",
    horario: ed.horario ?? "",
    local: ed.local ?? "",
    passou,
    valeQr: !passou && !r.chegou_em && (r.status === "confirmada" || r.status === "aguardando"),
  };
}

/** "https://www.quintahits.com.br": o endereço em que a página foi aberta (o mesmo do link enviado ao cliente). */
export async function origemDaRequisicao(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.quintahits.com.br";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}

/** Endereço do QR: leva ao check-in da reserva no app da casa, no mesmo domínio em que o cliente abriu. */
export async function linkDoCheckin(id: string): Promise<string> {
  return `${await origemDaRequisicao()}/casa/checkin/${id}`;
}
