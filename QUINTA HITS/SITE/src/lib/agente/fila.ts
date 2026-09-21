import "server-only";
import { createHmac } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { agenteLigadoPorEnv, ambienteAtual, envioLigadoPorEnv, envioRealPermitidoPorEnv, idParaEnvio, versaoGraphApi } from "./ambiente";
import { decidirEnvio } from "./ativacao";
import { atrasoDeReenvioSegundos, dentroDaJanela, falhaTemporaria, montarPayloadGraph, sanitizarErro } from "./graph";
import { obterConfig } from "./repositorio";
import type { Mensagem } from "./tipos";

/**
 * FILA DE SAÍDA (outbox no Postgres). Toda resposta do agente é gravada aqui primeiro; o envio real só acontece
 * quando TUDO permite: variável WHATSAPP_SEND_ENABLED, configuração do banco, sem pausa de emergência e (no modo teste)
 * destinatário na lista de testes. Com o envio desligado (padrão) os itens ficam pendentes e nada sai.
 */

export type ResultadoEnvio =
  | { ok: true; wamid: string }
  | { ok: false; httpStatus: number; codigo?: string; retryAfterS?: number; detalhe?: string };

export type Enviador = (para: string, corpoGraph: Record<string, unknown>) => Promise<ResultadoEnvio>;

const LOTE_PADRAO = 20;
const TRAVA_S = 120;
const ADIAMENTO_LIMITE_S = 300;

/** Grava a resposta na fila. Devolve "repetida" se a chave de idempotência já existia (sem envio duplicado). */
export async function enfileirar(p: { conversaId: string; mensagemId: string | null; para: string; mensagem: Mensagem; chave: string }): Promise<"nova" | "repetida"> {
  const { error } = await supabaseAdmin().from("wa_fila_saida").insert({
    conversa_id: p.conversaId,
    mensagem_id: p.mensagemId,
    para: p.para,
    tipo: p.mensagem.tipo === "texto" ? "texto" : "interativo",
    payload: { mensagem: p.mensagem },
    chave_idempotencia: p.chave,
  });
  if (error?.code === "23505") return "repetida";
  if (error) throw new Error(`Erro ao enfileirar mensagem: ${error.message}`);
  return "nova";
}

/**
 * Envio real pela Graph API. SÓ é chamado depois de `decidirEnvio` liberar; ainda assim recusa por conta própria
 * se o número de envio não for o da QUINTA HITS ou se faltar o token.
 */
export const enviarViaGraph: Enviador = async (para, corpo) => {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = idParaEnvio();
  if (!envioRealPermitidoPorEnv() || !token || !phoneId) return { ok: false, httpStatus: 0, codigo: "envio_nao_configurado" };

  const prova = process.env.META_APP_SECRET_PROOF_ENABLED?.trim().toLowerCase() === "true" && process.env.WHATSAPP_APP_SECRET
    ? `?appsecret_proof=${createHmac("sha256", process.env.WHATSAPP_APP_SECRET).update(token).digest("hex")}`
    : "";
  try {
    const res = await fetch(`https://graph.facebook.com/${versaoGraphApi()}/${phoneId}/messages${prova}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { code?: number; message?: string } };
    if (res.ok && json.messages?.[0]?.id) return { ok: true, wamid: json.messages[0].id };
    const retry = Number(res.headers.get("retry-after"));
    return { ok: false, httpStatus: res.status, codigo: json.error?.code !== undefined ? String(json.error.code) : undefined, retryAfterS: Number.isFinite(retry) && retry > 0 ? retry : undefined, detalhe: json.error?.message };
  } catch (e) {
    return { ok: false, httpStatus: 0, codigo: "rede", detalhe: e instanceof Error ? e.name : "erro de rede" };
  }
};

export type ResumoFila = { enviadas: number; reagendadas: number; falhas: number; mortas: number; bloqueadas: number; canceladas: number; adiadas: number; semMigracao: boolean };

type ItemFila = { id: string; conversa_id: string | null; mensagem_id: string | null; para: string; payload: { mensagem: Mensagem }; tentativas: number; max_tentativas: number };

/** Processa um lote da fila. Chamado depois da resposta ao webhook e por reprocessamento. */
export async function processarFila(o: { agora?: Date; limite?: number; enviador?: Enviador } = {}): Promise<ResumoFila> {
  const agora = o.agora ?? new Date();
  const enviador = o.enviador ?? enviarViaGraph;
  const resumo: ResumoFila = { enviadas: 0, reagendadas: 0, falhas: 0, mortas: 0, bloqueadas: 0, canceladas: 0, adiadas: 0, semMigracao: false };
  const config = await obterConfig();
  if (!config) return { ...resumo, semMigracao: true };
  const flags = { envAgente: agenteLigadoPorEnv(), envEnvio: envioLigadoPorEnv(), ambienteApp: ambienteAtual() };
  const db = supabaseAdmin();

  // Itens "enviando" com a trava vencida (processo que caiu no meio) voltam para a fila.
  await db.from("wa_fila_saida").update({ status: "pendente", travado_ate: null }).eq("status", "enviando").lt("travado_ate", agora.toISOString());

  const { data, error } = await db
    .from("wa_fila_saida")
    .select("id, conversa_id, mensagem_id, para, payload, tentativas, max_tentativas")
    .eq("status", "pendente")
    .lte("proxima_tentativa_em", agora.toISOString())
    .order("proxima_tentativa_em", { ascending: true })
    .limit(o.limite ?? LOTE_PADRAO);
  if (error) throw new Error(`Erro ao ler a fila: ${error.message}`);

  for (const item of (data ?? []) as ItemFila[]) {
    const decisao = decidirEnvio(flags, config, item.para);
    // Envio real com o número de envio errado (ex.: o final 0200) ou sem token: nada sai, o item fica pendente.
    if (decisao.ativo && enviador === enviarViaGraph && (!idParaEnvio() || !process.env.WHATSAPP_TOKEN)) {
      resumo.bloqueadas++;
      continue;
    }
    if (!decisao.ativo) {
      if (decisao.motivo === "fora_da_lista_de_teste") {
        await db.from("wa_fila_saida").update({ status: "cancelada", erro_codigo: "fora_da_lista_de_teste", updated_at: agora.toISOString() }).eq("id", item.id).eq("status", "pendente");
        resumo.canceladas++;
      } else resumo.bloqueadas++;
      continue;
    }

    const conversa = item.conversa_id ? (await db.from("wa_conversas").select("ultima_msg_cliente_em").eq("id", item.conversa_id).maybeSingle()).data as { ultima_msg_cliente_em: string | null } | null : null;
    if (!dentroDaJanela(conversa?.ultima_msg_cliente_em ?? null, agora)) {
      await marcarFalha(item, "fora_da_janela_24h", "Fora da janela de 24 horas: só template aprovado.", agora);
      resumo.falhas++;
      continue;
    }

    if (item.conversa_id) {
      const desde = new Date(agora.getTime() - 3_600_000).toISOString();
      const { count } = await db.from("wa_mensagens").select("id", { count: "exact", head: true }).eq("conversa_id", item.conversa_id).eq("direcao", "saida").eq("status", "enviada").gte("criada_em", desde);
      if ((count ?? 0) >= config.limite_saidas_por_contato_hora) {
        await db.from("wa_fila_saida").update({ proxima_tentativa_em: new Date(agora.getTime() + ADIAMENTO_LIMITE_S * 1000).toISOString() }).eq("id", item.id);
        resumo.adiadas++;
        continue;
      }
    }

    // Reserva o item (compara-e-troca): dois processadores nunca enviam o mesmo item.
    const { data: reservado } = await db
      .from("wa_fila_saida")
      .update({ status: "enviando", tentativas: item.tentativas + 1, travado_ate: new Date(agora.getTime() + TRAVA_S * 1000).toISOString(), updated_at: agora.toISOString() })
      .eq("id", item.id)
      .eq("status", "pendente")
      .select("id")
      .maybeSingle();
    if (!reservado) continue;

    const numero = item.tentativas + 1;
    const inicio = Date.now();
    const r = await enviador(item.para, montarPayloadGraph(item.para, item.payload.mensagem));
    await db.from("wa_fila_tentativas").insert({
      fila_id: item.id, numero, http_status: r.ok ? 200 : r.httpStatus, erro_codigo: r.ok ? null : r.codigo ?? null,
      erro_detalhe: r.ok ? null : sanitizarErro(r.detalhe), duracao_ms: Date.now() - inicio,
    });

    if (r.ok) {
      await db.from("wa_fila_saida").update({ status: "enviada", enviada_em: agora.toISOString(), travado_ate: null, payload: { mensagem: { tipo: "texto", corpo: "" } }, updated_at: agora.toISOString() }).eq("id", item.id);
      if (item.mensagem_id) await db.from("wa_mensagens").update({ wamid: r.wamid, status: "enviada" }).eq("id", item.mensagem_id);
      resumo.enviadas++;
    } else if (falhaTemporaria(r.httpStatus) && numero < item.max_tentativas) {
      const espera = atrasoDeReenvioSegundos(numero, r.retryAfterS);
      await db.from("wa_fila_saida").update({ status: "pendente", travado_ate: null, proxima_tentativa_em: new Date(agora.getTime() + espera * 1000).toISOString(), erro_codigo: r.codigo ?? String(r.httpStatus), erro_detalhe: sanitizarErro(r.detalhe), updated_at: agora.toISOString() }).eq("id", item.id);
      resumo.reagendadas++;
    } else {
      // Sem mais tentativas (dead-letter) ou erro definitivo.
      const morta = falhaTemporaria(r.httpStatus);
      await marcarFalha(item, r.codigo ?? String(r.httpStatus), r.detalhe, agora, morta ? "morta" : "falhou");
      if (morta) resumo.mortas++; else resumo.falhas++;
    }
  }
  return resumo;
}

async function marcarFalha(item: ItemFila, codigo: string, detalhe: string | undefined, agora: Date, status: "falhou" | "morta" = "falhou") {
  const db = supabaseAdmin();
  await db.from("wa_fila_saida").update({ status, travado_ate: null, erro_codigo: codigo, erro_detalhe: sanitizarErro(detalhe), updated_at: agora.toISOString() }).eq("id", item.id);
  if (item.mensagem_id) await db.from("wa_mensagens").update({ status: "falhou", erro_codigo: codigo, erro_detalhe: sanitizarErro(detalhe) }).eq("id", item.mensagem_id);
}
