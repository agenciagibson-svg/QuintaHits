import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/adminSessao";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tabelaAusente } from "@/lib/disponibilidade";
import { erroInterno } from "@/lib/respostas";

export const dynamic = "force-dynamic";

/** GET /api/admin/auditoria?limite=100 — últimas ações registradas (quem fez o quê). O detalhe guarda só nomes de campos e contagens. */
export async function GET(req: Request) {
  const negado = await exigirSessao();
  if (negado) return negado;
  const pedido = Number(new URL(req.url).searchParams.get("limite") ?? 100);
  const limite = Number.isInteger(pedido) ? Math.min(Math.max(pedido, 1), 500) : 100;
  const { data, error } = await supabaseAdmin().from("auditoria").select("id, ator, acao, entidade, entidade_id, detalhe, criado_em").order("id", { ascending: false }).limit(limite);
  if (tabelaAusente(error)) return NextResponse.json({ migrado: false, itens: [] });
  if (error) return NextResponse.json({ erro: erroInterno(error) }, { status: 500 });
  return NextResponse.json({ migrado: true, itens: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
