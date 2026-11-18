import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { formatData } from "@/lib/edicao";
import { lerMeuIngresso } from "@/lib/ingressos";
import { linkDoCheckin } from "@/lib/minhaReserva";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Seu ingresso", robots: { index: false, follow: false } };

const reais = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace(".", ",")}`;
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/** Ingresso individual do cliente, com o QR de entrada (leva a /casa/checkin/<id>, como o da reserva de mesa). */
export default async function MeuIngresso({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const i = await lerMeuIngresso(id);
  if (!i) notFound();
  const qr = i.valeQr ? await QRCode.toString(await linkDoCheckin(i.id), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#171717", light: "#ffffff" } }) : null;

  const situacao =
    i.status === "cancelado"
      ? "Este ingresso foi cancelado."
      : i.chegou_em
        ? `Entrada registrada às ${hora(i.chegou_em)}. Bom show!`
        : i.passou
          ? "Essa noite já passou."
          : `Ingresso confirmado. Pague ${reais(i.totalCentavos)} na portaria e mostre este QR na entrada.`;

  return (
    <section className="secao secao--creme">
      <div className="wrap minha-reserva">
        <div className="eyebrow">{i.casa.nome} · Seu ingresso</div>
        <h1 className="display h-2" style={{ margin: "6px 0 4px" }}>
          {i.quantidade} ingresso{i.quantidade > 1 ? "s" : ""}
        </h1>
        <p className="minha-reserva__noite">
          {formatData(i.data, "longa")}
          {i.horario ? ` · ${i.horario}` : ""}
          {i.tema ? ` · ${i.tema}` : ""}
          {i.artista ? ` · ${i.artista}` : ""}
        </p>
        <p className="minha-reserva__quem">{i.primeiroNome} · ingresso individual (sem mesa)</p>
        <p className="minha-reserva__situacao">{situacao}</p>
        {i.status === "confirmado" && !i.passou && (
          <p className="minha-reserva__valores">
            <strong>
              {i.quantidade} × {reais(i.valorUnitarioCentavos)} = {reais(i.totalCentavos)} · pagamento na portaria
            </strong>
          </p>
        )}
        {qr && (
          <div className="minha-reserva__qr">
            <div aria-label="QR code de entrada" role="img" dangerouslySetInnerHTML={{ __html: qr }} />
            <p>Código <strong>{i.codigo}</strong></p>
            <small>Guarde esta página (é o seu ingresso). Deixe o brilho da tela no máximo na hora de mostrar.</small>
          </div>
        )}
      </div>
    </section>
  );
}
