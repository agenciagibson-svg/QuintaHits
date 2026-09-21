import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tabelaAusente } from "@/lib/disponibilidade";
import { registrarAuditoria } from "@/lib/auditoria";
import { telefoneParaExibir } from "./telefone";
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

export type ItemAtendimento = {
  transferencia_id: string;
  conversa_id: string;
  motivo: MotivoTransferencia;
  detalhe: string;
  status: StatusTransferencia;
  atendente: string | null;
  criada_em: string;
  assumida_em: string | null;
  contato: { nome: string; telefone: string };
  ultima_mensagem: string;
};

type LinhaTransferencia = {
  id: string; conversa_id: string; motivo: MotivoTransferencia; detalhe: string; status: StatusTransferencia; atendente: string | null; criada_em: string; assumida_em: string | null;
  wa_conversas: { wa_contatos: { nome: string; telefone: string | null } | null } | null;
};

/** null = a migração não foi aplicada neste banco. */
export async function listarAtendimentos(): Promise<{ pendentes: number; itens: ItemAtendimento[] } | null> {
  const { data, error } = await supabaseAdmin()
    .from("wa_transferencias")
    .select("id, conversa_id, motivo, detalhe, status, atendente, criada_em, assumida_em")
    .in("status", ["aguardando", "assumida"])
    .order("criada_em", { ascending: true });
  if (tabelaAusente(error)) return null;
  if (error) throw new Error(`Erro ao listar atendimentos: ${error.message}`);

  const itens: ItemAtendimento[] = [];
  for (const t of (data ?? []) as Omit<LinhaTransferencia, "wa_conversas">[]) {
    const { data: conv } = await supabaseAdmin().from("wa_conversas").select("contato_id").eq("id", t.conversa_id).maybeSingle();
    const { data: contato } = conv ? await supabaseAdmin().from("wa_contatos").select("nome, telefone").eq("id", (conv as { contato_id: string }).contato_id).maybeSingle() : { data: null };
    const { data: ultima } = await supabaseAdmin().from("wa_mensagens").select("conteudo").eq("conversa_id", t.conversa_id).eq("direcao", "entrada").order("criada_em", { ascending: false }).limit(1).maybeSingle();
    const c = contato as { nome: string; telefone: string | null } | null;
    itens.push({
      transferencia_id: t.id, conversa_id: t.conversa_id, motivo: t.motivo, detalhe: t.detalhe, status: t.status, atendente: t.atendente, criada_em: t.criada_em, assumida_em: t.assumida_em,
      contato: { nome: c?.nome ?? "", telefone: telefoneParaExibir(c?.telefone ?? null) },
      ultima_mensagem: ((ultima as { conteudo: string } | null)?.conteudo ?? "").slice(0, 200),
    });
  }
  return { pendentes: itens.filter((i) => i.status === "aguardando").length, itens };
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

/** Nome de quem atende: o cookie de sessão do painel não guarda identidade, então o atendente informa o próprio nome. */
export function nomeDeAtendenteValido(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const n = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return n.length >= 2 && n.length <= 60 ? n : null;
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
  await registrarAuditoria({ ator: `atendente:${atendente}`, acao: "atendimento_assumido", entidade: "transferencia", entidadeId: transferenciaId });
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
  await registrarAuditoria({ ator: `atendente:${atendente}`, acao: "atendimento_devolvido_ao_agente", entidade: "transferencia", entidadeId: transferenciaId });
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
  await registrarAuditoria({ ator: `atendente:${atendente}`, acao: "atendimento_encerrado", entidade: "transferencia", entidadeId: transferenciaId });
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
  await registrarAuditoria({ ator: `atendente:${atendente}`, acao: "mensagem_de_atendente_enfileirada", entidade: "transferencia", entidadeId: transferenciaId });
  return "enfileirada";
}
