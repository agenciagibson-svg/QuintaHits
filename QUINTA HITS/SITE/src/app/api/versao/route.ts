import { NextResponse } from "next/server";
import { VERSAO_DO_BUILD } from "@/lib/versao";

export const dynamic = "force-dynamic";

/** GET /api/versao — versão (deploy) que está no ar. Pública, sem dados; nunca em cache. */
export function GET() {
  return NextResponse.json({ versao: VERSAO_DO_BUILD }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
