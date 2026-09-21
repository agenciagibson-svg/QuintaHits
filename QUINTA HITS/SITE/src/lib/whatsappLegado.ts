import "server-only";
import { site } from "@/config/site";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { expirarPedidosVencidos } from "@/lib/reservas";
import { formatData } from "@/lib/edicao";
import { CODIGO_RE, mesmoWhatsapp } from "@/lib/reserva";
import { enviarTexto, type MensagemRecebida } from "@/lib/whatsapp";

/**
 * FLUXO ATUAL, preservado sem alteração de lógica: o cliente reservou pelo site, recebeu um código QH-NNNNNN e o
 * manda pelo WhatsApp; o mesmo número que fez o pedido confirma a reserva. Movido da rota do webhook para cá só
 * para a rota poder rotear por `phone_number_id`; o comportamento é o mesmo.
 */
export async function tratarMensagemLegado({ de, texto, enviadaEm }: MensagemRecebida) {
  const achado = CODIGO_RE.exec(texto);
  if (!achado) {
    await enviarTexto(de, `Oi! Este WhatsApp confirma reservas da ${site.nome}. Para reservar sua mesa, acesse ${site.url}/reservar`);
    return;
  }
  const codigo = `QH-${achado[1]}`;

  await expirarPedidosVencidos();
  const db = supabaseAdmin();
  // O mesmo código pode existir em pedidos antigos (expirados/cancelados); o que vale é o mais recente.
  const { data: reserva, error } = await db
    .from("reservas")
    .select("id, whatsapp, status, pessoas, expira_em, mesas(numero), edicoes(data, artista)")
    .eq("codigo", codigo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  if (!reserva) {
    await enviarTexto(de, `Não encontramos o código ${codigo}. Confira a mensagem ou faça a reserva de novo em ${site.url}/reservar`);
    return;
  }

  // Só o dono do número informado confirma: é isso que barra WhatsApp falso ou de outra pessoa.
  if (!mesmoWhatsapp(de, reserva.whatsapp)) {
    await enviarTexto(de, "Esse código foi pedido com outro número de WhatsApp. Mande a mensagem do mesmo número que você informou no site.");
    return;
  }

  const mesa = (reserva.mesas as unknown as { numero: string } | null)?.numero ?? "";
  const edicao = reserva.edicoes as unknown as { data: string; artista: string } | null;
  const quando = edicao ? `${formatData(edicao.data, "longa")}${edicao.artista ? ` com ${edicao.artista}` : ""}` : "";
  const liberada = `O prazo desse pedido acabou e a mesa ${mesa} foi liberada. Faça uma nova reserva em ${site.url}/reservar`;

  if (reserva.status === "confirmada") {
    await enviarTexto(de, `Sua mesa ${mesa} já está confirmada${quando ? ` para ${quando}` : ""}. Até lá!`);
    return;
  }
  if (reserva.status === "cancelada") {
    await enviarTexto(de, `Esse pedido foi cancelado pela equipe. Para reservar de novo, acesse ${site.url}/reservar`);
    return;
  }

  // Vale a hora em que o cliente MANDOU (relógio da Meta): mensagem enviada no prazo e entregue com atraso,
  // ou que perdeu a corrida para a expiração, ainda confirma — se a mesa não foi pega por outra pessoa.
  const noPrazo = reserva.expira_em !== null && enviadaEm <= new Date(reserva.expira_em).getTime();
  if (reserva.status === "expirada" && !noPrazo) {
    await enviarTexto(de, liberada);
    return;
  }

  // Muda só a partir de aguardando/expirada: mensagem repetida ou reenviada pela Meta não confirma duas vezes.
  const agora = new Date().toISOString();
  const { data: confirmada, error: erroUpdate } = await db
    .from("reservas")
    .update({ status: "confirmada", confirmada_em: agora, updated_at: agora })
    .eq("id", reserva.id)
    .in("status", noPrazo ? ["aguardando", "expirada"] : ["aguardando"])
    .select("id")
    .maybeSingle();
  // Índice único: a mesa já foi reservada por outra pessoa depois que este pedido expirou.
  if (erroUpdate?.code === "23505") {
    await enviarTexto(de, liberada);
    return;
  }
  if (erroUpdate) throw erroUpdate;
  if (!confirmada) {
    // Outra entrega da mesma mensagem já confirmou (ou o status mudou no meio): não responde de novo.
    return;
  }

  await enviarTexto(
    de,
    `Reserva confirmada! Mesa ${mesa} para ${reserva.pessoas} ${reserva.pessoas === 1 ? "pessoa" : "pessoas"}${quando ? `, ${quando}` : ""}, no ${site.casa.nome}. ${site.assinatura}`,
  );
}
