import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/adminSessao";
import { estadoDasIntegracoes } from "@/lib/integracoes";
import { erroInterno } from "@/lib/respostas";

export const dynamic = "force-dynamic";

/** GET /api/admin/integracoes — estado das chaves e credenciais SEM valores secretos (só ligada/desligada e configurada/ausente). */
export async function GET() {
  const negado = await exigirSessao();
  if (negado) return negado;
  try {
    return NextResponse.json(await estadoDasIntegracoes(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("Erro ao montar o estado das integrações:", e instanceof Error ? e.message : "erro");
    return NextResponse.json({ erro: erroInterno(null) }, { status: 500 });
  }
}
