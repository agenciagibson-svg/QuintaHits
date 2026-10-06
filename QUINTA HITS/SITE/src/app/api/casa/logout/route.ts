import { NextResponse } from "next/server";
import { COOKIE_CASA } from "@/lib/casaAuth";

export async function POST() {
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(COOKIE_CASA, "", { path: "/", maxAge: 0 });
  return resposta;
}
