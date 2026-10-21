import MinhaReserva, { generateMetadata as metadadosDaReserva } from "../../minha-reserva/[id]/page";

export const dynamic = "force-dynamic";

/**
 * Link curto da reserva, o que vai na mensagem do WhatsApp: www.quintahits.com.br/r/02a04ac59ebd. Mesma página (e a
 * mesma prévia com o QR grande) de /minha-reserva/<id>; os 12 caracteres são o começo aleatório do id da reserva.
 */
export async function generateMetadata({ params }: { params: Promise<{ curto: string }> }) {
  const { curto } = await params;
  return metadadosDaReserva({ params: Promise.resolve({ id: curto }) });
}

export default async function ReservaPeloLinkCurto({ params }: { params: Promise<{ curto: string }> }) {
  const { curto } = await params;
  return MinhaReserva({ params: Promise.resolve({ id: curto }) });
}
