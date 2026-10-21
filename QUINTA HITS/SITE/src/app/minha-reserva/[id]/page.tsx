import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { formatData } from "@/lib/edicao";
import { linkDoCheckin, lerMinhaReserva, origemDaRequisicao } from "@/lib/minhaReserva";

export const dynamic = "force-dynamic";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/**
 * Título e descrição da prévia do link (WhatsApp): "Mesa 33 · 06/11 · Harley Grill". A imagem da prévia é o próprio
 * QR de entrada (qr.png ao lado), com o endereço em que o link foi aberto: o cliente já vê o QR na conversa.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = await lerMinhaReserva(id).catch(() => null);
  if (!r) return { title: "Sua reserva", robots: { index: false, follow: false } };
  const origem = await origemDaRequisicao();
  const imagem = `${origem}/minha-reserva/${r.id}/qr.png`;
  const titulo = `Mesa ${r.mesa} · ${formatData(r.data, "numerica")} · ${r.casa.nome}`;
  const descricao = r.valeQr
    ? `${[r.horario && `A partir das ${r.horario}`, r.artista].filter(Boolean).join(" · ")}${r.horario || r.artista ? ". " : ""}Seu QR de entrada: mostre na porta.`
    : "Sua reserva";
  return {
    title: { absolute: `${titulo} — sua reserva` },
    description: descricao,
    robots: { index: false, follow: false },
    openGraph: {
      title: r.status === "confirmada" ? `Reserva confirmada · ${titulo}` : titulo,
      description: descricao,
      siteName: r.casa.nome,
      type: "website",
      locale: "pt_BR",
      url: `${origem}/minha-reserva/${r.id}`,
      images: [{ url: imagem, width: 1200, height: 630, alt: "QR code de entrada da reserva" }],
    },
    twitter: { card: "summary_large_image", title: titulo, description: descricao, images: [imagem] },
  };
}

/**
 * Página da reserva do cliente, com o QR de entrada. O link (id da reserva, impossível de adivinhar) vai na mensagem de
 * confirmação do WhatsApp e na tela do pedido. Mostra só o necessário: primeiro nome, mesa, pessoas, noite e casa.
 * O QR leva a /casa/checkin/<id>: lido pela equipe (app da casa ou câmera do celular), registra a chegada.
 */
export default async function MinhaReserva({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await lerMinhaReserva(id);
  if (!r) notFound();
  const qr = r.valeQr ? await QRCode.toString(await linkDoCheckin(r.id), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#171717", light: "#ffffff" } }) : null;

  const situacao =
    r.status === "confirmada" && r.chegou_em
      ? `Check-in feito às ${hora(r.chegou_em)}. Bom show!`
      : r.status === "confirmada"
        ? "Reserva confirmada. Mostre este QR na entrada."
        : r.status === "aguardando"
          ? "Pedido recebido: a equipe confirma pelo seu WhatsApp. Guarde este QR para a entrada."
          : r.status === "nao_compareceu"
            ? "A mesa foi liberada porque não registramos sua chegada até o fim da tolerância."
            : r.status === "cancelada"
              ? "Esta reserva foi cancelada."
              : "Este pedido expirou sem confirmação.";

  return (
    <section className="secao secao--creme">
      <div className="wrap minha-reserva">
        <div className="eyebrow">{r.casa.nome} · Sua reserva</div>
        <h1 className="display h-2" style={{ margin: "6px 0 4px" }}>Mesa {r.mesa}</h1>
        <p className="minha-reserva__noite">
          {formatData(r.data, "longa")}
          {r.horario ? ` · ${r.horario}` : ""}
          {r.artista ? ` · ${r.artista}` : ""}
          {r.casa.id === "quinta-hits" && r.local ? ` · ${r.local}` : ""}
        </p>
        <p className="minha-reserva__quem">
          {r.primeiroNome} · {r.pessoas} pessoa{r.pessoas > 1 ? "s" : ""}
        </p>
        {r.passou && r.status !== "cancelada" && r.status !== "expirada" ? (
          <p className="minha-reserva__situacao">{r.chegou_em ? `Você fez check-in às ${hora(r.chegou_em)}. Obrigado por vir!` : "Essa noite já passou."}</p>
        ) : (
          <p className="minha-reserva__situacao">{situacao}</p>
        )}
        {qr && (
          <div className="minha-reserva__qr">
            <div aria-label="QR code de entrada" role="img" dangerouslySetInnerHTML={{ __html: qr }} />
            {r.codigo && <p>Código <strong>{r.codigo}</strong></p>}
            <small>Deixe o brilho da tela no máximo na hora de mostrar.</small>
          </div>
        )}
      </div>
    </section>
  );
}
