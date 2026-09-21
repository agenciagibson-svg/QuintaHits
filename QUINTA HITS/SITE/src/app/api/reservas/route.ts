import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { expirarPedidosVencidos } from "@/lib/reservas";
import { edicaoProntaParaSite } from "@/lib/regras";
import { verificarMesa } from "@/lib/disponibilidade";
import { verificarTurnstile } from "@/lib/turnstile";
import { numeroDaCasa } from "@/lib/whatsapp";
import { estadoDasReservasDoSite } from "@/lib/reservasSite";
import {
  MAX_RESERVAS_POR_WHATSAPP,
  PRAZO_CONFIRMACAO_MIN,
  STATUS_OCUPA_MESA,
  inteiroEntre,
  mensagemConfirmacao,
  normalizarWhatsapp,
} from "@/lib/reserva";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const erro = (mensagem: string, status: number) => NextResponse.json({ erro: mensagem }, { status });

/**
 * POST /api/reservas — pedido de mesa feito pelo site.
 * Nasce "aguardando" com um código; a mesa fica segura por PRAZO_CONFIRMACAO_MIN até o cliente
 * mandar o código pelo WhatsApp (o webhook em /api/whatsapp/webhook confirma).
 */
export async function POST(req: Request) {
  // Primeira coisa, antes de ler o corpo ou falar com qualquer serviço: com a chave desligada nenhuma reserva é criada.
  const estado = estadoDasReservasDoSite();
  if (!estado.aberto) {
    return erro(
      estado.motivo === "chave_desligada"
        ? "As reservas online abrirão em breve. Fale com a gente pelo Instagram."
        : "A reserva pelo site está indisponível agora. Fale com a gente pelo Instagram.",
      503,
    );
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return erro("Pedido inválido.", 400);

  // Campo invisível no formulário: gente não preenche, robô preenche. Finge sucesso para não ensinar o robô.
  if (typeof body.site === "string" && body.site !== "") return NextResponse.json({ ok: true }, { status: 201 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  if (!(await verificarTurnstile(body.turnstile, ip))) {
    return erro("Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.", 403);
  }

  const numeroCasa = numeroDaCasa();
  if (!numeroCasa) return erro("A reserva pelo site está indisponível agora. Fale com a gente pelo Instagram.", 503);

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (nome.length < 2 || nome.length > 80) return erro("Informe seu nome.", 400);

  const whatsapp = normalizarWhatsapp(body.whatsapp);
  if (!whatsapp) return erro("Informe seu celular com DDD, ex.: (34) 99999-9999.", 400);

  const pessoas = inteiroEntre(body.pessoas, 1, 50);
  if (!pessoas) return erro("Informe quantas pessoas vão.", 400);

  const edicaoId = typeof body.edicao_id === "string" ? body.edicao_id : "";
  const mesaId = typeof body.mesa_id === "string" ? body.mesa_id : "";
  if (!UUID_RE.test(mesaId)) return erro("Escolha uma mesa no mapa.", 400);

  try {
    // Só edição completa (regras, mesa oferecida ao site) e liberada explicitamente para o site aceita reserva.
    if (!(await edicaoProntaParaSite(edicaoId))) return erro("Essa edição não está aberta para reservas pelo site.", 409);
    await expirarPedidosVencidos();

    const db = supabaseAdmin();
    // Disponibilidade única (lib/disponibilidade.ts): a mesma consulta do WhatsApp e do painel. "Ocupada" não barra
    // aqui: quem decide a disputa é o índice único do banco, na gravação abaixo (resposta 409 de sempre).
    const verificacao = await verificarMesa(edicaoId, mesaId, "site", pessoas);
    if (!verificacao.ok && (verificacao.motivo === "mesa_inexistente" || verificacao.motivo === "canal_indisponivel")) {
      return erro("Essa mesa não está disponível.", 404);
    }
    const mesa = verificacao.mesa!;
    if (!verificacao.ok && verificacao.motivo === "lugares_insuficientes") {
      return erro(`A mesa ${mesa.numero} é para até ${mesa.lugares} pessoas. Escolha uma mesa maior.`, 400);
    }

    const { count, error: erroContagem } = await db
      .from("reservas")
      .select("id", { count: "exact", head: true })
      .eq("edicao_id", edicaoId)
      .eq("whatsapp", whatsapp)
      .in("status", STATUS_OCUPA_MESA);
    if (erroContagem) throw erroContagem;
    if ((count ?? 0) >= MAX_RESERVAS_POR_WHATSAPP) {
      return erro("Esse WhatsApp já tem reservas nesta edição. Fale com a gente para mudar.", 409);
    }

    const expiraEm = new Date(Date.now() + PRAZO_CONFIRMACAO_MIN * 60_000).toISOString();

    // Código repetido entre pedidos aguardando é raro (6 dígitos), mas o índice do banco barra: tenta outro.
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const codigo = `QH-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
      const { data, error } = await db
        .from("reservas")
        .insert({ edicao_id: edicaoId, mesa_id: mesa.id, nome, whatsapp, pessoas, codigo, expira_em: expiraEm })
        .select("id")
        .single();

      if (error?.code === "23505" && error.message.includes("reservas_codigo_aguardando")) continue;
      // Índice único do banco: outra pessoa pediu a mesma mesa um instante antes.
      if (error?.code === "23505") return erro("Essa mesa acabou de ser reservada. Escolha outra.", 409);
      if (error) throw error;

      return NextResponse.json(
        {
          ok: true,
          id: data.id,
          mesa: mesa.numero,
          codigo,
          expiraEm,
          whatsappLink: `https://wa.me/${numeroCasa}?text=${encodeURIComponent(mensagemConfirmacao(codigo))}`,
        },
        { status: 201 },
      );
    }
    throw new Error("Não foi possível gerar um código de reserva livre.");
  } catch (e) {
    console.error(e);
    return erro("Não foi possível enviar sua reserva. Tente de novo.", 500);
  }
}
