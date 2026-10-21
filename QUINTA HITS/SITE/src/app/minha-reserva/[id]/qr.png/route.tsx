import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { formatData } from "@/lib/edicao";
import { linkDoCheckin, lerMinhaReserva } from "@/lib/minhaReserva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const size = { width: 1200, height: 630 };

/**
 * GET /minha-reserva/<id>/qr.png — imagem da prévia do link da reserva no WhatsApp (og:image, ver page.tsx): o QR de entrada grande + mesa, noite, casa e código. O cliente vê o
 * QR direto na conversa (sem abrir o link) e a porta lê da própria prévia. Reserva cancelada, expirada, já usada ou de
 * noite passada: cartão sem QR.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await lerMinhaReserva(id).catch(() => null);
  const qr = r?.valeQr ? await QRCode.toDataURL(await linkDoCheckin(r.id), { margin: 1, width: 560, errorCorrectionLevel: "M" }) : null;
  const aviso = !r
    ? "Reserva não encontrada"
    : r.chegou_em
      ? "Check-in já feito"
      : r.passou
        ? "Essa noite já passou"
        : r.status === "cancelada"
          ? "Reserva cancelada"
          : r.status === "expirada"
            ? "Pedido expirado"
            : r.status === "nao_compareceu"
              ? "Mesa liberada"
              : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#17352B", color: "#F1E7D2", fontFamily: "sans-serif" }}>
        <div style={{ width: 630, height: 630, display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
          {qr ? (
            <img src={qr} width={560} height={560} alt="" style={{ display: "flex" }} />
          ) : (
            <div style={{ display: "flex", color: "#171717", fontSize: 44, fontWeight: 700, textAlign: "center", padding: 40 }}>{aviso}</div>
          )}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 48px", gap: 10 }}>
          <div style={{ display: "flex", fontSize: 26, letterSpacing: 4, textTransform: "uppercase", opacity: 0.8 }}>{r ? r.casa.nome : "QUINTA HITS"}</div>
          {r && <div style={{ display: "flex", fontSize: 92, fontWeight: 700, lineHeight: 1 }}>{`Mesa ${r.mesa}`}</div>}
          {r && (
            <div style={{ display: "flex", fontSize: 34 }}>
              {`${formatData(r.data, "numerica")}${r.horario ? ` · ${r.horario}` : ""} · ${r.pessoas} pessoa${r.pessoas > 1 ? "s" : ""}`}
            </div>
          )}
          {r?.artista && <div style={{ display: "flex", fontSize: 28, opacity: 0.85 }}>{r.artista}</div>}
          {r?.codigo && (
            <div style={{ display: "flex", marginTop: 14, alignSelf: "flex-start", background: "#D5A62A", color: "#171717", padding: "10px 20px", borderRadius: 12, fontSize: 30, fontWeight: 700, letterSpacing: 2 }}>
              {r.codigo}
            </div>
          )}
          {qr && <div style={{ display: "flex", marginTop: 10, fontSize: 24, opacity: 0.8 }}>Mostre este QR na entrada</div>}
        </div>
      </div>
    ),
    { ...size, headers: { "Cache-Control": "private, no-store" } },
  );
}
