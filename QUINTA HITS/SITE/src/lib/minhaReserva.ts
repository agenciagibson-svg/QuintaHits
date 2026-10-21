import "server-only";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hojeISO } from "@/lib/edicao";
import { expirarPedidosVencidos } from "@/lib/reservas";
import { CASAS, casaDaEdicaoId, dataDaEdicaoId, type Casa } from "@/config/casas";
import type { StatusReserva } from "@/lib/reserva";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
export async function lerMinhaReserva(id: string): Promise<MinhaReserva | null> {
  if (!UUID_RE.test(id)) return null;
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
