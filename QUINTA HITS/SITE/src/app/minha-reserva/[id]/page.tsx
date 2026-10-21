import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { formatData, hojeISO } from "@/lib/edicao";
import { expirarPedidosVencidos } from "@/lib/reservas";
import { CASAS, casaDaEdicaoId, dataDaEdicaoId } from "@/config/casas";
import type { StatusReserva } from "@/lib/reserva";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sua reserva",
  robots: { index: false, follow: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/**
 * Página da reserva do cliente, com o QR de entrada. O link (id da reserva, impossível de adivinhar) vai na mensagem de
 * confirmação do WhatsApp e na tela do pedido. Mostra só o necessário: primeiro nome, mesa, pessoas, noite e casa.
 * O QR leva a /casa/checkin/<id>: lido pela equipe (app da casa ou câmera do celular), registra a chegada.
 */
export default async function MinhaReserva({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  await expirarPedidosVencidos().catch(() => undefined);
  const db = supabaseAdmin();
  const { data } = await db.from("reservas").select("id, edicao_id, mesa_id, nome, whatsapp, pessoas, status, codigo, chegou_em").eq("id", id).maybeSingle();
  // Mesa travada pela equipe não é reserva de cliente: sem página.
  if (!data || (data as { whatsapp: string }).whatsapp === "") notFound();
  const r = data as { id: string; edicao_id: string; mesa_id: string; nome: string; pessoas: number; status: StatusReserva; codigo: string | null; chegou_em: string | null };
  const [{ data: mesa }, { data: edicao }] = await Promise.all([
    db.from("mesas").select("numero").eq("id", r.mesa_id).maybeSingle(),
    db.from("edicoes").select("artista, horario, local").eq("id", r.edicao_id).maybeSingle(),
  ]);
  const casa = CASAS[casaDaEdicaoId(r.edicao_id)];
  const dataNoite = dataDaEdicaoId(r.edicao_id);
  const ed = (edicao ?? {}) as { artista?: string; horario?: string; local?: string };
  const primeiroNome = r.nome.trim().split(/\s+/)[0] || r.nome;
  const passou = dataNoite < hojeISO();
  const valeQr = !passou && (r.status === "confirmada" || r.status === "aguardando");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.quintahits.com.br";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const qr = valeQr ? await QRCode.toString(`${protocolo}://${host}/casa/checkin/${r.id}`, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#171717", light: "#ffffff" } }) : null;

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
        <div className="eyebrow">{casa.nome} · Sua reserva</div>
        <h1 className="display h-2" style={{ margin: "6px 0 4px" }}>Mesa {(mesa as { numero?: string } | null)?.numero ?? "?"}</h1>
        <p className="minha-reserva__noite">
          {formatData(dataNoite, "longa")}
          {ed.horario ? ` · ${ed.horario}` : ""}
          {ed.artista ? ` · ${ed.artista}` : ""}
          {casa.id === "quinta-hits" && ed.local ? ` · ${ed.local}` : ""}
        </p>
        <p className="minha-reserva__quem">
          {primeiroNome} · {r.pessoas} pessoa{r.pessoas > 1 ? "s" : ""}
        </p>
        {passou && r.status !== "cancelada" && r.status !== "expirada" ? (
          <p className="minha-reserva__situacao">{r.chegou_em ? `Você fez check-in às ${hora(r.chegou_em)}. Obrigado por vir!` : "Essa noite já passou."}</p>
        ) : (
          <p className="minha-reserva__situacao">{situacao}</p>
        )}
        {qr && !r.chegou_em && (
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
