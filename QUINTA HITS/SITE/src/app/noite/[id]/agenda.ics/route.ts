import { icsDaNoite, lerNoite } from "@/lib/noite";
import { origemDaRequisicao } from "@/lib/minhaReserva";

export const dynamic = "force-dynamic";

/** GET /noite/<id>/agenda.ics — o evento da noite para a agenda do celular (iPhone, Outlook...), com lembrete. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = await lerNoite(id);
  if (!n || n.edicao.status === "cancelada") return new Response("Noite não encontrada.", { status: 404 });
  const ics = icsDaNoite(n, `${await origemDaRequisicao()}/noite/${n.edicao.id}`);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="quinta-hits-${n.edicao.data}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
