import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ROTINA DE RETENÇÃO DE DADOS (LGPD). Independente de framework: recebe o cliente do banco, então serve à rota do
 * painel, ao script de linha de comando e aos testes com a mesma lógica.
 *
 * Política inicial (configurável em wa_config; PENDENTE de validação administrativa e jurídica antes da produção):
 *   conteúdo das mensagens 90 dias · metadados e status 12 meses · detalhe de erro 90 dias · eventos de webhook 30 dias ·
 *   conversas encerradas anonimizadas após 12 meses · reservas anonimizadas após 24 meses.
 *
 * Garantias: nasce DESLIGADA; tem execução SIMULADA (só conta); registra APENAS QUANTIDADES (nunca o conteúdo apagado);
 * respeita reservas ainda abertas; nunca lida com tokens, PINs ou segredos (eles não existem nessas tabelas).
 */

export type PoliticaRetencao = {
  retencao_conteudo_mensagens_dias: number;
  retencao_metadados_meses: number;
  retencao_logs_erro_dias: number;
  retencao_eventos_webhook_dias: number;
  anonimizar_conversas_encerradas_meses: number;
  retencao_reservas_meses: number;
};

export type ConfigRetencao = PoliticaRetencao & {
  ambiente: "producao" | "homologacao";
  limpeza_ativa: boolean;
  politica_retencao_validada_em: string | null;
};

export type ResumoRetencao = { simulado: boolean; contagens: Record<string, number> };

const CAMPOS_CONFIG =
  "ambiente, limpeza_ativa, politica_retencao_validada_em, retencao_conteudo_mensagens_dias, retencao_metadados_meses, retencao_logs_erro_dias, retencao_eventos_webhook_dias, anonimizar_conversas_encerradas_meses, retencao_reservas_meses";

const LOTE = 500;
const TERMINAIS = ["enviada", "falhou", "morta", "cancelada"];

const diasAtras = (agora: Date, d: number) => new Date(agora.getTime() - d * 86_400_000).toISOString();
function mesesAtras(agora: Date, m: number): string {
  const x = new Date(agora.getTime());
  x.setUTCMonth(x.getUTCMonth() - m);
  return x.toISOString();
}

/** A execução REAL só é permitida com tudo isto junto; qualquer coisa faltando = só simulação. */
export function podeExecutar(cfg: Pick<ConfigRetencao, "limpeza_ativa" | "ambiente" | "politica_retencao_validada_em">, env: { retencaoEnv?: string; ambienteApp: "producao" | "homologacao" }): { ok: boolean; motivo: string } {
  if (env.retencaoEnv?.trim().toLowerCase() !== "true") return { ok: false, motivo: "RETENCAO_ENABLED não está ligada (desativada por padrão)" };
  if (!cfg.limpeza_ativa) return { ok: false, motivo: "wa_config.limpeza_ativa está desligada" };
  if (cfg.ambiente !== env.ambienteApp) return { ok: false, motivo: "ambiente da aplicação diferente do ambiente marcado no banco" };
  if (cfg.ambiente === "producao" && !cfg.politica_retencao_validada_em) return { ok: false, motivo: "política de retenção ainda não validada (administrativa e jurídica)" };
  return { ok: true, motivo: "ok" };
}

async function contar(consulta: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await consulta;
  if (error) throw new Error(`Retenção: erro ao contar (${error.message})`);
  return count ?? 0;
}

async function lerConfig(db: SupabaseClient): Promise<ConfigRetencao> {
  const { data, error } = await db.from("wa_config").select(CAMPOS_CONFIG).eq("id", 1).maybeSingle();
  if (error || !data) throw new Error("Retenção: configuração do agente indisponível (migração não aplicada?).");
  return data as ConfigRetencao;
}

/**
 * Executa (ou só simula) a retenção. `simular` é o padrão. Devolve apenas contagens.
 * Na execução real, se `podeExecutar` não liberar, LANÇA e não altera nada.
 */
export async function executarRetencao(db: SupabaseClient, o: { agora?: Date; simular?: boolean; retencaoEnv?: string; ambienteApp?: "producao" | "homologacao" } = {}): Promise<ResumoRetencao> {
  const agora = o.agora ?? new Date();
  const simular = o.simular ?? true;
  const cfg = await lerConfig(db);
  if (!simular) {
    const perm = podeExecutar(cfg, { retencaoEnv: o.retencaoEnv, ambienteApp: o.ambienteApp ?? "producao" });
    if (!perm.ok) throw new Error(`Retenção: execução real recusada: ${perm.motivo}.`);
  }
  const aplicar = !simular;
  const iso = agora.toISOString();
  const c: Record<string, number> = {};
  const hoje = iso.slice(0, 10);

  // 1. Conteúdo integral das mensagens: o texto sai, a linha (metadados) fica.
  const corteConteudo = diasAtras(agora, cfg.retencao_conteudo_mensagens_dias);
  const filtroConteudo = () => db.from("wa_mensagens").select("id", { count: "exact", head: true }).lt("criada_em", corteConteudo).is("conteudo_removido_em", null).neq("conteudo", "");
  c.mensagens_conteudo_removido = await contar(filtroConteudo());
  if (aplicar && c.mensagens_conteudo_removido > 0) {
    await db.from("wa_mensagens").update({ conteudo: "", conteudo_removido_em: iso }).lt("criada_em", corteConteudo).is("conteudo_removido_em", null).neq("conteudo", "");
  }

  // 2. Texto guardado no payload da fila (itens já finalizados).
  c.fila_payload_limpo = await contar(db.from("wa_fila_saida").select("id", { count: "exact", head: true }).in("status", TERMINAIS).lt("criada_em", corteConteudo).neq("payload", "{}"));
  if (aplicar && c.fila_payload_limpo > 0) await db.from("wa_fila_saida").update({ payload: {} }).in("status", TERMINAIS).lt("criada_em", corteConteudo).neq("payload", "{}");

  // 3. Detalhe de erro (o código do erro fica com os metadados).
  const corteLogs = diasAtras(agora, cfg.retencao_logs_erro_dias);
  for (const [tabela, coluna] of [["wa_mensagens", "criada_em"], ["wa_fila_saida", "criada_em"], ["wa_fila_tentativas", "criada_em"]] as const) {
    const n = await contar(db.from(tabela).select("id", { count: "exact", head: true }).lt(coluna, corteLogs).not("erro_detalhe", "is", null));
    c[`${tabela}_erro_detalhe_limpo`] = n;
    if (aplicar && n > 0) await db.from(tabela).update({ erro_detalhe: null }).lt(coluna, corteLogs).not("erro_detalhe", "is", null);
  }

  // 4. Metadados técnicos e status de entrega.
  const corteMeta = mesesAtras(agora, cfg.retencao_metadados_meses);
  c.mensagens_apagadas = await contar(db.from("wa_mensagens").select("id", { count: "exact", head: true }).lt("criada_em", corteMeta));
  if (aplicar && c.mensagens_apagadas > 0) await db.from("wa_mensagens").delete().lt("criada_em", corteMeta);
  c.fila_apagada = await contar(db.from("wa_fila_saida").select("id", { count: "exact", head: true }).in("status", TERMINAIS).lt("criada_em", corteMeta));
  if (aplicar && c.fila_apagada > 0) await db.from("wa_fila_saida").delete().in("status", TERMINAIS).lt("criada_em", corteMeta);

  // 5. Eventos de webhook (idempotência).
  const corteEventos = diasAtras(agora, cfg.retencao_eventos_webhook_dias);
  c.eventos_webhook_apagados = await contar(db.from("wa_webhook_eventos").select("id", { count: "exact", head: true }).lt("recebido_em", corteEventos));
  if (aplicar && c.eventos_webhook_apagados > 0) await db.from("wa_webhook_eventos").delete().lt("recebido_em", corteEventos);

  // 6. Conversas encerradas há mais de X meses: anonimiza o contato (nunca quem tem reserva aberta ou conversa recente).
  const corteConversas = mesesAtras(agora, cfg.anonimizar_conversas_encerradas_meses);
  const { data: antigas } = await db.from("wa_conversas").select("contato_id").eq("status", "encerrada").lt("encerrada_em", corteConversas).limit(LOTE);
  const candidatos = [...new Set(((antigas ?? []) as { contato_id: string }[]).map((x) => x.contato_id))];
  let anonimizados = 0;
  for (const contatoId of candidatos) {
    const { data: contato } = await db.from("wa_contatos").select("id, telefone, anonimizado_em").eq("id", contatoId).maybeSingle();
    const ct = contato as { id: string; telefone: string | null; anonimizado_em: string | null } | null;
    if (!ct || ct.anonimizado_em) continue;
    // Conversa aberta ou encerrada há pouco: o contato ainda está "vivo".
    const abertas = await contar(db.from("wa_conversas").select("id", { count: "exact", head: true }).eq("contato_id", contatoId).neq("status", "encerrada"));
    const recentes = await contar(db.from("wa_conversas").select("id", { count: "exact", head: true }).eq("contato_id", contatoId).eq("status", "encerrada").gte("encerrada_em", corteConversas));
    if (abertas + recentes > 0) continue;
    if (await temReservaAberta(db, ct, hoje)) continue;
    anonimizados++;
    if (aplicar) {
      await db.from("wa_contatos").update({ nome: "", telefone: null, observacoes: "", wa_id: `anon-${crypto.randomUUID().replace(/-/g, "")}`, anonimizado_em: iso, updated_at: iso }).eq("id", contatoId);
      await db.from("wa_conversas").update({ contexto: {} }).eq("contato_id", contatoId);
    }
  }
  c.contatos_anonimizados = anonimizados;

  // 7. Reservas antigas: anonimiza (mantém edição, mesa, pessoas e status para estatística). Reserva aberta é preservada.
  const corteReservas = mesesAtras(agora, cfg.retencao_reservas_meses);
  const { data: velhas } = await db.from("reservas").select("id, status, edicoes(data)").lt("created_at", corteReservas).neq("nome", "[removido]").limit(LOTE);
  const alvo = ((velhas ?? []) as unknown as { id: string; status: string; edicoes: { data: string } | null }[])
    .filter((r) => !(["aguardando", "confirmada"].includes(r.status) && (r.edicoes?.data ?? "") >= hoje))
    .map((r) => r.id);
  c.reservas_anonimizadas = alvo.length;
  if (aplicar && alvo.length > 0) await db.from("reservas").update({ nome: "[removido]", whatsapp: "00000000000", observacoes: "", contato_id: null, updated_at: iso }).in("id", alvo);

  // Só quantidades vão para a auditoria: nunca o conteúdo apagado.
  await db.from("auditoria").insert({ ator: "sistema", acao: simular ? "retencao_simulada" : "retencao_executada", entidade: "retencao", entidade_id: null, detalhe: c });
  return { simulado: simular, contagens: c };
}

async function temReservaAberta(db: SupabaseClient, contato: { id: string; telefone: string | null }, hoje: string): Promise<boolean> {
  const consulta = db.from("reservas").select("id, edicoes(data)").in("status", ["aguardando", "confirmada"]);
  const { data } = await (contato.telefone ? consulta.eq("whatsapp", contato.telefone) : consulta.eq("contato_id", contato.id));
  return ((data ?? []) as unknown as { edicoes: { data: string } | null }[]).some((r) => (r.edicoes?.data ?? "") >= hoje);
}
