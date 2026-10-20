import { NextResponse } from "next/server";
import { atorDaCasa, exigirSessaoCasa } from "@/lib/casaSessao";
import { mudarStatusReserva } from "@/lib/statusReserva";
import { CASA_PADRAO } from "@/config/casas";

export const dynamic = "force-dynamic";

/** PUT /api/casa/reservas/:id — `{ status: "confirmada" | "cancelada" }`: aprovar ou recusar pelo app da casa. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const negado = await exigirSessaoCasa();
  if (negado) return negado;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const r = await mudarStatusReserva(id, body?.status, await atorDaCasa(), { origem: "casa", somenteDeHojeEmDiante: true, somenteDaCasa: CASA_PADRAO });
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status });
  return NextResponse.json({ reserva: r.reserva });
}
