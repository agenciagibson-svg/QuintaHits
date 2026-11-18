import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { edicaoProntaParaSite } from "@/lib/regras";
import { verificarTurnstile } from "@/lib/turnstile";
import { estadoDasReservasDoSite } from "@/lib/reservasSite";
import { limiteExcedido } from "@/lib/limiteTaxa";
import { registrarAuditoria } from "@/lib/auditoria";
import { agendarDepois } from "@/lib/agente/depois";
import { notificarCasa } from "@/lib/pushCasa";
import { impressaoDoIp } from "@/lib/protecao";
import { formatData } from "@/lib/edicao";
import { reservasSiteLigadoPorEnv } from "@/lib/agente/ambiente";
import { CASAS, casaDaEdicaoId, dataDaEdicaoId, edicaoIdValido } from "@/config/casas";
import { inteiroEntre, normalizarWhatsapp } from "@/lib/reserva";
import { MAX_INGRESSOS_POR_PEDIDO, MAX_PEDIDOS_INGRESSO_POR_WHATSAPP, emitirIngresso, semMigracaoDeIngressos } from "@/lib/ingressos";

export const dynamic = "force-dynamic";

const erro = (mensagem: string, status: number) => NextResponse.json({ erro: mensagem }, { status });

/**
 * POST /api/ingressos — ingresso individual (sem mesa) pelo site: `{ edicao_id, nome, whatsapp, quantidade, politica,
 * turnstile, site }`. Sai CONFIRMADO, com QR de entrada em /ingresso/<id>; o cliente paga na portaria. Mesmas barreiras
 * da reserva de mesa (chave do site, noite liberada, robô, Política de Privacidade, limite por endereço).
 */
export async function POST(req: Request) {
  if (!reservasSiteLigadoPorEnv()) return erro("A venda pelo site abre em breve. Fale com a gente pelo Instagram.", 503);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return erro("Pedido inválido.", 400);

  const edicaoId = typeof body.edicao_id === "string" ? body.edicao_id : "";
  if (!edicaoIdValido(edicaoId)) return erro("Noite inválida.", 400);
  const casa = casaDaEdicaoId(edicaoId);
  if (!estadoDasReservasDoSite(casa).aberto) return erro("A venda pelo site está indisponível agora.", 503);

  // Campo invisível: gente não preenche, robô preenche. Finge sucesso para não ensinar o robô.
  if (typeof body.site === "string" && body.site !== "") return NextResponse.json({ ok: true }, { status: 201 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  if (ip && limiteExcedido(`ingresso:${ip}`, 10, 10 * 60_000)) return erro("Muitas tentativas. Aguarde alguns minutos e tente de novo.", 429);
  if (!(await verificarTurnstile(body.turnstile, ip, req.headers.get("host")))) {
    return erro("Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.", 403);
  }
  if (body.politica !== true) return erro("Leia a Política de Privacidade e marque a caixa para continuar.", 400);

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (nome.length < 2 || nome.length > 80) return erro("Informe seu nome.", 400);
  const whatsapp = normalizarWhatsapp(body.whatsapp);
  if (!whatsapp) return erro("Informe seu celular com DDD, ex.: (34) 99999-9999.", 400);
  const quantidade = inteiroEntre(body.quantidade, 1, MAX_INGRESSOS_POR_PEDIDO);
  if (!quantidade) return erro(`Escolha de 1 a ${MAX_INGRESSOS_POR_PEDIDO} ingressos.`, 400);

  try {
    if (!(await edicaoProntaParaSite(edicaoId))) return erro("Essa noite não está aberta pelo site.", 409);

    const { count, error: erroContagem } = await supabaseAdmin()
      .from("ingressos")
      .select("id", { count: "exact", head: true })
      .eq("edicao_id", edicaoId)
      .eq("whatsapp", whatsapp)
      .eq("status", "confirmado");
    if (semMigracaoDeIngressos(erroContagem)) return erro("A venda de ingressos abre em breve.", 503);
    if (erroContagem) throw erroContagem;
    if ((count ?? 0) >= MAX_PEDIDOS_INGRESSO_POR_WHATSAPP) return erro("Esse WhatsApp já tem ingressos nesta noite. Fale com a gente para mudar.", 409);

    const r = await emitirIngresso({ edicaoId, nome, whatsapp, quantidade, ipHash: ip ? impressaoDoIp(ip) : null });
    if (!r.ok && r.motivo === "indisponivel") return erro("Essa noite não vende ingresso individual pelo site.", 409);
    if (!r.ok) {
      return erro(
        r.restantes ? `Restam só ${r.restantes} ingresso${r.restantes > 1 ? "s" : ""} para esta noite.` : "Os ingressos desta noite esgotaram.",
        409,
      );
    }

    await registrarAuditoria({ ator: "site", acao: "ingresso_site_emitido", entidade: "ingresso", entidadeId: r.id, detalhe: { origem: "site", politica_aceita: true, casa, quantidade } });
    agendarDepois(() =>
      notificarCasa(
        {
          titulo: `Ingresso vendido · ${CASAS[casa].nome}`,
          corpo: `${quantidade} ingresso${quantidade > 1 ? "s" : ""} · dia ${formatData(dataDaEdicaoId(edicaoId), "numerica")}`,
          url: `/casa?edicao=${encodeURIComponent(edicaoId)}`,
        },
        casa,
      ),
    );
    return NextResponse.json({ ok: true, id: r.id, codigo: r.codigo, quantidade }, { status: 201 });
  } catch (e) {
    console.error("Erro ao emitir ingresso:", (e as { code?: string } | null)?.code ?? "sem código");
    return erro("Não foi possível emitir seu ingresso. Tente de novo.", 500);
  }
}
