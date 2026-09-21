import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tabelaAusente } from "@/lib/disponibilidade";
import type { ConfigAgente } from "./ativacao";
import { telefoneDoWaId } from "./telefone";
import type { Contexto, EstadoConversa } from "./tipos";

/** Acesso às tabelas do agente (contatos, conversas, mensagens, configuração). Só o servidor usa. */

export type StatusConversa = "agente" | "aguardando_humano" | "com_humano" | "encerrada";

export type Contato = {
  id: string;
  wa_id: string;
  telefone: string | null;
  nome: string;
  bloqueado: boolean;
  preferencia_atendimento: "agente" | "humano";
};

export type Conversa = {
  id: string;
  contato_id: string;
  status: StatusConversa;
  estado: EstadoConversa;
  contexto: Contexto;
  versao: number;
  tentativas_sem_entender: number;
  ultima_msg_cliente_em: string | null;
  updated_at: string;
};

const CAMPOS_CONTATO = "id, wa_id, telefone, nome, bloqueado, preferencia_atendimento";
const CAMPOS_CONVERSA = "id, contato_id, status, estado, contexto, versao, tentativas_sem_entender, ultima_msg_cliente_em, updated_at";

/** Configuração global do agente. null = a migração não foi aplicada neste banco. */
export async function obterConfig(): Promise<ConfigAgente | null> {
  const { data, error } = await supabaseAdmin()
    .from("wa_config")
    .select("ambiente, agente_ativo, envio_ativo, transferencia_humana_ativa, pausa_emergencia, restringir_a_numeros_teste, numeros_teste, limite_entradas_por_contato_hora, limite_saidas_por_contato_hora")
    .eq("id", 1)
    .maybeSingle();
  if (tabelaAusente(error)) return null;
  if (error) throw new Error(`Erro ao ler a configuração do agente: ${error.message}`);
  return (data as ConfigAgente | null) ?? null;
}

/** Encontra o contato pelo wa_id ou cria (o cliente escreveu primeiro: é o consentimento para o atendimento). */
export async function obterOuCriarContato(waId: string, nomePerfil: string | null): Promise<Contato> {
  const db = supabaseAdmin();
  const agora = new Date().toISOString();
  const buscar = async () => {
    const { data, error } = await db.from("wa_contatos").select(CAMPOS_CONTATO).eq("wa_id", waId).maybeSingle();
    if (error) throw new Error(`Erro ao buscar contato: ${error.message}`);
    return data as Contato | null;
  };

  let contato = await buscar();
  if (!contato) {
    const { data, error } = await db
      .from("wa_contatos")
      .insert({ wa_id: waId, telefone: telefoneDoWaId(waId), nome: nomePerfil ?? "", origem: "whatsapp_entrada", consentimento_em: agora })
      .select(CAMPOS_CONTATO)
      .single();
    if (error?.code === "23505") contato = await buscar(); // dois eventos ao mesmo tempo: o outro criou primeiro
    else if (error) throw new Error(`Erro ao criar contato: ${error.message}`);
    else contato = data as Contato;
  }
  if (!contato) throw new Error("Contato não encontrado após a criação.");

  const patch: Record<string, unknown> = { ultima_interacao_em: agora, updated_at: agora };
  if (!contato.nome && nomePerfil) { patch.nome = nomePerfil; contato = { ...contato, nome: nomePerfil }; }
  await db.from("wa_contatos").update(patch).eq("id", contato.id);
  return contato;
}

/** A conversa aberta do contato, ou abre uma nova (no máximo uma aberta por contato, garantido pelo banco). */
export async function obterOuAbrirConversa(contatoId: string): Promise<Conversa> {
  const db = supabaseAdmin();
  const buscar = async () => {
    const { data, error } = await db.from("wa_conversas").select(CAMPOS_CONVERSA).eq("contato_id", contatoId).neq("status", "encerrada").maybeSingle();
    if (error) throw new Error(`Erro ao buscar conversa: ${error.message}`);
    return data as Conversa | null;
  };
  const existente = await buscar();
  if (existente) return existente;
  const { data, error } = await db.from("wa_conversas").insert({ contato_id: contatoId }).select(CAMPOS_CONVERSA).single();
  if (error?.code === "23505") {
    const outra = await buscar();
    if (outra) return outra;
  }
  if (error) throw new Error(`Erro ao abrir conversa: ${error.message}`);
  return data as Conversa;
}

export type PatchConversa = Partial<Pick<Conversa, "status" | "estado" | "contexto" | "tentativas_sem_entender" | "ultima_msg_cliente_em">> & { encerrada_em?: string | null };

/**
 * Grava a conversa com TRAVA OTIMISTA: só grava se a `versao` ainda é a que foi lida. Devolve a conversa nova, ou null
 * se outra mensagem alterou a conversa no meio (quem chama relê e refaz). Assim duas mensagens simultâneas do mesmo
 * cliente nunca se atropelam.
 */
export async function salvarConversa(conversa: Conversa, patch: PatchConversa): Promise<Conversa | null> {
  const { data, error } = await supabaseAdmin()
    .from("wa_conversas")
    .update({ ...patch, versao: conversa.versao + 1, updated_at: new Date().toISOString() })
    .eq("id", conversa.id)
    .eq("versao", conversa.versao)
    .select(CAMPOS_CONVERSA)
    .maybeSingle();
  if (error) throw new Error(`Erro ao salvar conversa: ${error.message}`);
  return (data as Conversa | null) ?? null;
}

export type NovaMensagem = {
  wamid?: string | null;
  conversaId: string;
  direcao: "entrada" | "saida";
  autor: "cliente" | "agente" | "atendente" | "sistema";
  tipo: string;
  conteudo: string;
  status: "recebida" | "na_fila" | "enviada" | "entregue" | "lida" | "falhou";
};

/** Grava a mensagem. Devolve null se o wamid já existia (mensagem repetida). */
export async function gravarMensagem(m: NovaMensagem): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("wa_mensagens")
    .insert({ wamid: m.wamid ?? null, conversa_id: m.conversaId, direcao: m.direcao, autor: m.autor, tipo: m.tipo, conteudo: m.conteudo.slice(0, 4096), status: m.status })
    .select("id")
    .single();
  if (error?.code === "23505") return null;
  if (error) throw new Error(`Erro ao gravar mensagem: ${error.message}`);
  return (data as { id: string }).id;
}

const ORDEM_STATUS = ["na_fila", "enviada", "entregue", "lida"] as const;

/** Atualização de entrega vinda da Meta. "falhou" vale sempre; entregue/lida só avançam (nunca voltam). */
export async function aplicarStatusDeEntrega(wamid: string, status: string, erroCodigo: string | null): Promise<void> {
  const db = supabaseAdmin();
  const novo = status === "failed" ? "falhou" : status === "delivered" ? "entregue" : status === "read" ? "lida" : status === "sent" ? "enviada" : null;
  if (!novo) return;
  const { data } = await db.from("wa_mensagens").select("id, status").eq("wamid", wamid).maybeSingle();
  if (!data) return;
  const atual = (data as { status: string }).status;
  if (novo !== "falhou" && ORDEM_STATUS.indexOf(novo) <= ORDEM_STATUS.indexOf(atual as (typeof ORDEM_STATUS)[number])) return;
  await db.from("wa_mensagens").update({ status: novo, ...(novo === "falhou" ? { erro_codigo: erroCodigo ?? "desconhecido" } : {}) }).eq("id", (data as { id: string }).id);
}

/** Quantas mensagens o cliente mandou na conversa na última hora (limite contra abuso). */
export async function contarEntradasNaUltimaHora(conversaId: string, agora = new Date()): Promise<number> {
  const desde = new Date(agora.getTime() - 3_600_000).toISOString();
  const { count, error } = await supabaseAdmin()
    .from("wa_mensagens")
    .select("id", { count: "exact", head: true })
    .eq("conversa_id", conversaId)
    .eq("direcao", "entrada")
    .gte("criada_em", desde);
  if (error) throw new Error(`Erro ao contar mensagens: ${error.message}`);
  return count ?? 0;
}
