import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { site } from "@/config/site";
import { formatData, proximaEdicao } from "@/lib/programacao";

export const runtime = "nodejs";
export const alt = "QUINTA HITS — A quinta oficial de Uberlândia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const svg = await readFile(join(process.cwd(), "public", "brand", "logo-placa.svg"));
  const logo = `data:image/svg+xml;base64,${svg.toString("base64")}`;
  const prox = proximaEdicao();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#17352B",
          color: "#F1E7D2",
          padding: 64,
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 620 }}>
          <div style={{ display: "flex", fontSize: 26, letterSpacing: 4, textTransform: "uppercase", opacity: 0.85 }}>
            {site.slogan}
          </div>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.05 }}>Quinta já é quase sexta.</div>
          <div style={{ display: "flex", fontSize: 28, opacity: 0.9 }}>
            {`Toda quinta · ${site.casa.nome} · ${site.cidade}`}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 10,
              background: "#B84A32",
              color: "#F1E7D2",
              padding: "14px 26px",
              borderRadius: "14px 14px 0 14px",
              fontSize: 26,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            {prox.artista ? `${formatData(prox.data)} · ${prox.artista}` : `Próxima: ${formatData(prox.data)}`}
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" width={420} height={385} style={{ display: "flex" }} />
      </div>
    ),
    size,
  );
}
