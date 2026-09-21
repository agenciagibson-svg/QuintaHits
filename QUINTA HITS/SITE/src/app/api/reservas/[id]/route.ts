import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { expirarPedidosVencidos } from "@/lib/reservas";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/reservas/:id — só o status do pedido, para a tela do cliente saber quando o WhatsApp confirmou.
 * O id (uuid) só é conhecido por quem fez o pedido; nome e WhatsApp não saem daqui.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
  try {
    await expirarPedidosVencidos();
    const { data, error } = await supabaseAdmin().from("reservas").select("status").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
    return NextResponse.json({ status: data.status }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: "Não foi possível consultar o pedido." }, { status: 500 });
  }
}
