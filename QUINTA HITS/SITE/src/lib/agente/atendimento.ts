import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tabelaAusente } from "@/lib/disponibilidade";
import { registrarAuditoria } from "@/lib/auditoria";
import { telefoneMascarado } from "./telefone";
import { enfileirar } from "./fila";
import { gravarMensagem, salvarConversa, type Conversa } from "./repositorio";
import type { MotivoTransferencia } from "./tipos";

/**
 * ATENDIMENTO HUMANO. Quando o agente transfere, a conversa entra na fila "Aguardando atendimento humano" do painel;
 * enquanto ela estiver com uma pessoa, o agente NÃO responde nada. O atendente assume, responde pelo painel (como
 * o número é exclusivo da API, não há app no celular) e pode devolver a conversa ao agente.
 */

export type StatusTransferencia = "aguardando" | "assumida" | "devolvida" | "encerrada";

/** Abre a transferência (uma só aberta por conversa: o banco garante). */
export async function abrirTransferencia(conversaId: string, motivo: MotivoTransferencia, detalhe: string): Promise<"aberta" | "ja_existia"> {
  const { error } = await supabaseAdmin().from("wa_transferencias").insert({ conversa_id: conversaId, motivo, detalhe: detalhe.slice(0, 300) });
  if (error?.code === "23505") return "ja_existia";
  if (error) throw new Error(`Erro ao abrir transferência: ${error.message}`);
  await registrarAuditoria({ ator: "agente", acao: "transferencia_aberta", entidade: "conversa", entidadeId: conversaId, detalhe: { motivo } });
  return "aberta";
}

export type FiltroAtendimento = "abertas" | StatusTransferencia | "todas";
export const FILTROS_DE_ATENDIMENTO: readonly FiltroAtendimento[] = ["abertas", "aguardando", "assumida", "devolvida", "encerrada", "todas"];

export type ItemAtendimento = {
  transferencia_id: string;
  conversa_id: string;
  motivo: MotivoTransferencia;
  detalhe: string;
  status: StatusTransferencia;
  atendente: string | null;
  criada_em: string;
  assumida_em: string | null;
  /** Telefone MASCARADO (o painel de atendimento não precisa do número inteiro). */
  contato: { nome: string; telefone: string };
  ultima_mensagem: string;
  /** Mensagens do cliente que a equipe ainda não viu. */
  nao_lidas: number;
  /** Edição em que a conversa estava (contexto do agente), se houver. */
  edicao: { id: string; data: string; artista: string } | null;
  /** Reserva relacionada (a do contexto da conversa ou a mais recente do contato), se houver. */
  reserva: { codigo: string; status: string; mesa: string } | null;
};

const ABERTAS: StatusTransferencia[] = ["aguardando", "assumida"];
const COLUNAS_TRANSFERENCIA = "id, conversa_id, motivo, detalhe, status, atendente, criada_em, assumida_em";
/** Erro de coluna inexistente (a parte 2 da migração ainda não foi aplicada). */
const colunaAusente = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42703" || e.code === "PGRST204");

type LinhaTransferencia = { id: string; conversa_id: string; motivo: MotivoTransferencia; detalhe: string; status: StatusTransferencia; atendente: string | null; criada_em: string; assumida_em: string | null; lida_ate?: string | null };

async function nomeDaEdicao(edicaoId: string | undefined): Promise<ItemAtendimento["edicao"]> {
  if (!edicaoId) return null;
  const { data } = await supabaseAdmin().from("edicoes").select("id, data, artista").eq("id", edicaoId).maybeSingle();
  return (data as ItemAtendimento["edicao"]) ?? null;
}

async function reservaRelacionada(contatoId: string, reservaId: string | undefined): Promise<ItemAtendimento["reserva"]> {
  const db = supabaseAdmin();
  const consulta = db.from("reservas").select("codigo, status, mesas(numero)");
  const { data } = reservaId ? await consulta.eq("id", reservaId).maybeSingle() : await consulta.eq("contato_id", contatoId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const r = data as { codigo: string | null; status: string; mesas: { numero: string } | null } | null;
  return r ? { codigo: r.codigo ?? "", status: r.status, mesa: r.mesas?.numero ?? "" } : null;
}

/**
 * Fila de atendimento com filtro por status. null = a migração parte 1 não foi aplicada neste banco.
 * `abertas` (padrão) = aguardando + assumidas, da mais antiga para a mais nova; os demais filtros mostram o histórico (mais recente primeiro).
 */
export async function listarAtendimentos(filtro: FiltroAtendimento = "abertas", limite = 50): Promise<{ pendentes: number; nao_lidas: number; itens: ItemAtendimento[] } | null> {
  const db = supabaseAdmin();
  const consulta = (colunas: string) => {
    let q = db.from("wa_transferencias").select(colunas);
    if (filtro === "abertas") q = q.in("status", ABERTAS).order("criada_em", { ascending: true });
    else if (filtro === "todas") q = q.order("criada_em", { ascending: false });
    else q = q.eq("status", filtro).order("criada_em", { ascending: false });
    return q.limit(limite);
  };
  let comLida = true;
  let { data, error } = await consulta(`${COLUNAS_TRANSFERENCIA}, lida_ate`);
  if (colunaAusente(error)) {
    comLida = false; // sem a parte 2 não há como saber o que já foi lido: o indicador de não lidas some (em vez de contar tudo para sempre)
    ({ data, error } = await consulta(COLUNAS_TRANSFERENCIA));
  }
  if (tabelaAusente(error)) return null;
  if (error) throw new Error(`Erro ao listar atendimentos: ${error.message}`);

  const itens: ItemAtendimento[] = [];
  for (const t of (data ?? []) as unknown as LinhaTransferencia[]) {
    const { data: conv } = await db.from("wa_conversas").select("contato_id, contexto").eq("id", t.conversa_id).maybeSingle();
    const c = conv as { contato_id: string; contexto: { edicaoId?: string; reservaId?: string } | null } | null;
    const { data: contato } = c ? await db.from("wa_contatos").select("nome, telefone").eq("id", c.contato_id).maybeSingle() : { data: null };
    const { data: ultima } = await db.from("wa_mensagens").select("conteudo").eq("conversa_id", t.conversa_id).eq("direcao", "entrada").order("criada_em", { ascending: false }).limit(1).maybeSingle();
    let entradas = db.from("wa_mensagens").select("id", { count: "exact", head: true }).eq("conversa_id", t.conversa_id).eq("direcao", "entrada");
    if (t.lida_ate) entradas = entradas.gt("criada_em", t.lida_ate);
    const { count } = await entradas;
    const ct = contato as { nome: string; telefone: string | null } | null;
    itens.push({
      transferencia_id: t.id, conversa_id: t.conversa_id, motivo: t.motivo, detalhe: t.detalhe, status: t.status, atendente: t.atendente, criada_em: t.criada_em, assumida_em: t.assumida_em,
      contato: { nome: ct?.nome ?? "", telefone: telefoneMascarado(ct?.telefone ?? null) },
      ultima_mensagem: ((ultima as { conteudo: string } | null)?.conteudo ?? "").slice(0, 200),
      nao_lidas: comLida && ABERTAS.includes(t.status) ? (count ?? 0) : 0,
      edicao: await nomeDaEdicao(c?.contexto?.edicaoId),
      reserva: c ? await reservaRelacionada(c.contato_id, c.contexto?.reservaId) : null,
    });
  }
  return {
    pendentes: itens.filter((i) => i.status === "aguardando").length,
    nao_lidas: itens.reduce((soma, i) => soma + i.nao_lidas, 0),
    itens,
  };
}

/** A equipe viu as mensagens do cliente até agora. Sem a coluna (parte 2 não aplicada) não faz nada. */
export async function marcarComoLida(transferenciaId: string): Promise<"ok" | "nao_encontrada" | "sem_migracao"> {
  const { data, error } = await supabaseAdmin().from("wa_transferencias").update({ lida_ate: new Date().toISOString() }).eq("id", transferenciaId).select("id").maybeSingle();
  if (colunaAusente(error)) return "sem_migracao";
  if (error) throw new Error(`Erro ao marcar como lida: ${error.message}`);
  return data ? "ok" : "nao_encontrada";
}

export type NotaInterna = { id: string; autor: string; texto: string; criada_em: string };

/** Notas internas do atendimento (nunca vão para o cliente). null = a parte 2 da migração não foi aplicada. */
export async function listarNotas(transferenciaId: string): Promise<NotaInterna[] | null> {
  const { data, error } = await supabaseAdmin().from("wa_notas_internas").select("id, autor, texto, criada_em").eq("transferencia_id", transferenciaId).order("criada_em", { ascending: true });
  if (tabelaAusente(error)) return null;
  if (error) throw new Error(`Erro ao ler as notas: ${error.message}`);
  return (data ?? []) as NotaInterna[];
}

/** Acrescenta uma nota interna. O autor é o e-mail de quem está logado. */
export async function adicionarNota(transferenciaId: string, autor: string, texto: string): Promise<"ok" | "invalida" | "nao_encontrada" | "sem_migracao"> {
  const corpo = texto.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (corpo.length < 1 || corpo.length > 1000) return "invalida";
  const { data: t } = await supabaseAdmin().from("wa_transferencias").select("id, conversa_id").eq("id", transferenciaId).maybeSingle();
  if (!t) return "nao_encontrada";
  const { error } = await supabaseAdmin().from("wa_notas_internas").insert({ transferencia_id: transferenciaId, conversa_id: (t as { conversa_id: string }).conversa_id, autor, texto: corpo });
  if (tabelaAusente(error)) return "sem_migracao";
  if (error) throw new Error(`Erro ao gravar a nota: ${error.message}`);
  await registrarAuditoria({ ator: autor, acao: "nota_interna_adicionada", entidade: "transferencia", entidadeId: transferenciaId });
  return "ok";
}

export type MensagemDoHistorico = { id: string; direcao: "entrada" | "saida"; autor: string; conteudo: string; status: string; criada_em: string };

/** Histórico da conversa da transferência (o conteúdo segue as regras de retenção). */
export async function historicoDaTransferencia(transferenciaId: string, limite = 100): Promise<MensagemDoHistorico[] | null> {
  const { data: t } = await supabaseAdmin().from("wa_transferencias").select("conversa_id").eq("id", transferenciaId).maybeSingle();
  if (!t) return null;
  const { data, error } = await supabaseAdmin()
    .from("wa_mensagens")
    .select("id, direcao, autor, conteudo, status, criada_em")
    .eq("conversa_id", (t as { conversa_id: string }).conversa_id)
    .order("criada_em", { ascending: true })
    .limit(limite);
  if (error) throw new Error(`Erro ao ler o histórico: ${error.message}`);
  return (data ?? []) as MensagemDoHistorico[];
}

async function conversaDa(transferenciaId: string): Promise<{ transferencia: { id: string; status: StatusTransferencia; atendente: string | null; conversa_id: string }; conversa: Conversa } | null> {
  const db = supabaseAdmin();
  const { data: t } = await db.from("wa_transferencias").select("id, status, atendente, conversa_id").eq("id", transferenciaId).maybeSingle();
  if (!t) return null;
  const { data: c } = await db.from("wa_conversas").select("id, contato_id, status, estado, contexto, versao, tentativas_sem_entender, ultima_msg_cliente_em, updated_at").eq("id", (t as { conversa_id: string }).conversa_id).maybeSingle();
  if (!c) return null;
  return { transferencia: t as { id: string; status: StatusTransferencia; atendente: string | null; conversa_id: string }, conversa: c as Conversa };
}

/** A conversa passa a ser da pessoa; o agente fica em silêncio. Duas pessoas ao mesmo tempo: só a primeira assume. */
export async function assumir(transferenciaId: string, atendente: string): Promise<"ok" | "nao_encontrada" | "ja_assumida"> {
  const db = supabaseAdmin();
  const agora = new Date().toISOString();
  const { data } = await db.from("wa_transferencias").update({ status: "assumida", atendente, assumida_em: agora }).eq("id", transferenciaId).eq("status", "aguardando").select("id, conversa_id").maybeSingle();
  if (!data) {
    const existente = await conversaDa(transferenciaId);
    return existente && existente.transferencia.status === "assumida" ? "ja_assumida" : "nao_encontrada";
  }
  await db.from("wa_conversas").update({ status: "com_humano", updated_at: agora }).eq("id", (data as { conversa_id: string }).conversa_id);
  await registrarAuditoria({ ator: atendente, acao: "atendimento_assumido", entidade: "transferencia", entidadeId: transferenciaId });
  return "ok";
}

/** Devolve a conversa ao agente: recomeça do menu, com o histórico preservado. */
export async function devolverAoAgente(transferenciaId: string, atendente: string): Promise<"ok" | "nao_encontrada"> {
  const achado = await conversaDa(transferenciaId);
  if (!achado || !["aguardando", "assumida"].includes(achado.transferencia.status)) return "nao_encontrada";
  const agora = new Date().toISOString();
  const { data } = await supabaseAdmin().from("wa_transferencias").update({ status: "devolvida", devolvida_em: agora }).eq("id", transferenciaId).in("status", ["aguardando", "assumida"]).select("id").maybeSingle();
  if (!data) return "nao_encontrada";
  // Trava otimista: se o cliente escreveu no meio, relê e tenta de novo.
  let conversa = achado.conversa;
  for (let i = 0; i < 3; i++) {
    const salvo = await salvarConversa(conversa, { status: "agente", estado: "WELCOME", contexto: {}, tentativas_sem_entender: 0 });
    if (salvo) break;
    conversa = (await conversaDa(transferenciaId))!.conversa;
  }
  await registrarAuditoria({ ator: atendente, acao: "atendimento_devolvido_ao_agente", entidade: "transferencia", entidadeId: transferenciaId });
  return "ok";
}

/** Encerra o atendimento: a conversa fecha (se o cliente escrever de novo, abre outra). */
export async function encerrarAtendimento(transferenciaId: string, atendente: string): Promise<"ok" | "nao_encontrada"> {
  const achado = await conversaDa(transferenciaId);
  if (!achado || !["aguardando", "assumida"].includes(achado.transferencia.status)) return "nao_encontrada";
  const agora = new Date().toISOString();
  const { data } = await supabaseAdmin().from("wa_transferencias").update({ status: "encerrada", encerrada_em: agora }).eq("id", transferenciaId).in("status", ["aguardando", "assumida"]).select("id").maybeSingle();
  if (!data) return "nao_encontrada";
  let conversa = achado.conversa;
  for (let i = 0; i < 3; i++) {
    const salvo = await salvarConversa(conversa, { status: "encerrada", estado: "CLOSED", encerrada_em: agora });
    if (salvo) break;
    conversa = (await conversaDa(transferenciaId))!.conversa;
  }
  await registrarAuditoria({ ator: atendente, acao: "atendimento_encerrado", entidade: "transferencia", entidadeId: transferenciaId });
  return "ok";
}

/** Resposta do atendente ao cliente: vai para a MESMA fila (respeita janela de 24 h, modo teste, pausa e envio desligado). */
export async function enviarComoAtendente(transferenciaId: string, atendente: string, texto: string): Promise<"enfileirada" | "nao_esta_com_voce" | "invalido"> {
  const corpo = texto.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (corpo.length < 1 || corpo.length > 1000) return "invalido";
  const achado = await conversaDa(transferenciaId);
  if (!achado || achado.transferencia.status !== "assumida" || achado.conversa.status !== "com_humano") return "nao_esta_com_voce";
  const { data: contato } = await supabaseAdmin().from("wa_contatos").select("wa_id").eq("id", achado.conversa.contato_id).maybeSingle();
  if (!contato) return "nao_esta_com_voce";
  const mensagemId = await gravarMensagem({ conversaId: achado.conversa.id, direcao: "saida", autor: "atendente", tipo: "text", conteudo: corpo, status: "na_fila" });
  await enfileirar({ conversaId: achado.conversa.id, mensagemId, para: (contato as { wa_id: string }).wa_id, mensagem: { tipo: "texto", corpo }, chave: `atendente:${transferenciaId}:${randomUUID()}` });
  await registrarAuditoria({ ator: atendente, acao: "mensagem_de_atendente_enfileirada", entidade: "transferencia", entidadeId: transferenciaId });
  return "enfileirada";
}
