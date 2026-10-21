import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { site } from "@/config/site";
import { formatData, mesCurto } from "@/lib/edicao";
import { lerNoite } from "@/lib/noite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEMANA = ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"];

/**
 * GET /noite/<id>/imagem.png — a arte da prévia do link da noite (WhatsApp, stories): data grande, atração, casa e
 * horário, nas cores da marca. Gerada na hora a partir do que está no painel.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = await lerNoite(id).catch(() => null);
  const svg = await readFile(join(process.cwd(), "public", "brand", "logo-placa.svg"));
  const logo = `data:image/svg+xml;base64,${svg.toString("base64")}`;
  const e = n?.edicao;
  const [, , dia] = e ? e.data.split("-") : ["", "", ""];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#17352B", color: "#F1E7D2", fontFamily: "sans-serif", padding: 56 }}>
        {e ? (
          <>
            <div style={{ width: 380, display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#F1E7D2", color: "#171717", borderRadius: "28px 28px 0 28px", padding: 36 }}>
              <div style={{ display: "flex", fontSize: 30, letterSpacing: 4 }}>{SEMANA[new Date(`${e.data}T12:00:00Z`).getUTCDay()]}</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 220, fontWeight: 700, lineHeight: 0.9 }}>{dia}</div>
                <div style={{ display: "flex", fontSize: 64, fontWeight: 700, letterSpacing: 6 }}>{mesCurto(e.data)}</div>
              </div>
              <div style={{ display: "flex", fontSize: 30 }}>{e.horario ? `A partir das ${e.horario}` : formatData(e.data, "numerica")}</div>
            </div>
            <div style={{ width: 640, marginLeft: 48, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ width: 640, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", fontSize: 26, letterSpacing: 4, textTransform: "uppercase", opacity: 0.85 }}>
                  {n.casa.id === "quinta-hits" ? site.nome : n.casa.nome}
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element -- imagem gerada (ImageResponse), não página */}
                <img src={logo} alt="" width={150} height={138} style={{ display: "flex" }} />
              </div>
              <div style={{ width: 640, display: "flex", flexDirection: "column", gap: 14 }}>
                {e.tema && <div style={{ display: "flex", fontSize: 30, opacity: 0.85 }}>{e.tema}</div>}
                <div style={{ display: "flex", fontSize: e.artista.length > 18 ? 72 : 96, fontWeight: 700, lineHeight: 1, textTransform: "uppercase" }}>
                  {e.artista || "Line-up em breve"}
                </div>
                <div style={{ display: "flex", fontSize: 30, opacity: 0.9 }}>{`${n.lugar} · ${site.cidade}/${site.uf}`}</div>
              </div>
              <div style={{ display: "flex" }}>
                <div style={{ display: "flex", background: e.status === "cancelada" ? "#171717" : "#B84A32", color: "#F1E7D2", padding: "14px 28px", borderRadius: "14px 14px 0 14px", fontSize: 28, letterSpacing: 2, textTransform: "uppercase" }}>
                  {e.status === "cancelada" ? "Cancelada" : n.reserva === "aberta" ? "Reserve sua mesa" : site.assinatura}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", fontSize: 48 }}>{site.nome}</div>
        )}
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=300" } },
  );
}
