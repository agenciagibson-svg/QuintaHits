/**
 * Ambiente e interruptores do agente de reservas — sem acesso a banco ou rede.
 *
 * REGRA DURA: o agente da QUINTA HITS só processa o Phone Number ID 1352142871312651 (+55 34 99116-7064).
 * O outro número da GIBSON PROMOÇÕES (final 0200) nunca é tratado, respondido nem alterado por este código.
 *
 * Tudo que liga uma funcionalidade nasce DESLIGADO: variável ausente, vazia ou diferente de EXATAMENTE "true" = desligado.
 * Ter credenciais da Meta configuradas NUNCA liga nada por si só: cada funcionalidade tem a sua própria chave.
 *   WHATSAPP_AGENT_ENABLED         agente de atendimento
 *   WHATSAPP_SEND_ENABLED          envio de mensagens (o envio REAL exige as duas chaves acima)
 *   WHATSAPP_REGISTRATION_ENABLED  registro do número na Meta (script manual separado, com confirmação interativa)
 *   RESERVAS_SITE_ENABLED          reserva de mesa pelo site
 */

/** Phone Number ID oficial da QUINTA HITS na WhatsApp Cloud API. Identificador técnico, não é segredo. */
export const PHONE_NUMBER_ID_QUINTA_HITS = "1352142871312651";

export type Ambiente = "producao" | "homologacao";

/** `APP_AMBIENTE=homologacao` habilita o número de teste; qualquer outro valor (ou ausência) é PRODUÇÃO, o modo estrito. */
export function ambienteAtual(): Ambiente {
  return process.env.APP_AMBIENTE?.trim().toLowerCase() === "homologacao" ? "homologacao" : "producao";
}

/** Modo estrito: só o texto exato "true" liga. "TRUE", "1", "yes", " true" ou vazio = desligado. */
const ligado = (v: string | undefined) => v === "true";

/** Interruptor mestre do agente pela variável de ambiente. Só "true" liga. */
export const agenteLigadoPorEnv = () => ligado(process.env.WHATSAPP_AGENT_ENABLED);

/** Chave de envio, isolada. NÃO basta para enviar: veja `envioRealPermitidoPorEnv`. */
export const envioLigadoPorEnv = () => ligado(process.env.WHATSAPP_SEND_ENABLED);

/** Envio REAL pela Meta: exige, ao mesmo tempo, o agente ligado E o envio ligado. */
export const envioRealPermitidoPorEnv = () => agenteLigadoPorEnv() && envioLigadoPorEnv();

/** Registro do número na Meta: só o script manual usa; sozinha esta chave não registra nada. */
export const registroLigadoPorEnv = () => ligado(process.env.WHATSAPP_REGISTRATION_ENABLED);

/** Reserva de mesa pelo site (formulário e API). Independe de qualquer credencial do WhatsApp. */
export const reservasSiteLigadoPorEnv = () => ligado(process.env.RESERVAS_SITE_ENABLED);

/** Repasse para humano: padrão LIGADO; só "false" desliga. */
export const repasseHumanoLigadoPorEnv = () => process.env.WHATSAPP_HUMAN_HANDOFF_ENABLED?.trim().toLowerCase() !== "false";

const soDigitos = (v: string | undefined) => (v ?? "").trim();
const idValido = (v: string) => /^\d{5,20}$/.test(v);

/**
 * Qual Phone Number ID é "a QUINTA HITS" para ROTEAR mensagens recebidas.
 * - Produção: sempre o ID oficial (a identidade não depende de variável de ambiente).
 * - Homologação: o ID do número de TESTE da Meta, vindo do ambiente; nunca o de produção.
 * Retorna null se a configuração for insegura; nesse caso TODO evento é tratado como "outro número".
 */
export function idQuintaHitsParaRoteamento(): string | null {
  if (ambienteAtual() === "producao") return PHONE_NUMBER_ID_QUINTA_HITS;
  const id = soDigitos(process.env.WHATSAPP_PHONE_NUMBER_ID);
  return idValido(id) && id !== PHONE_NUMBER_ID_QUINTA_HITS ? id : null;
}

/**
 * Por qual Phone Number ID uma mensagem PODE SER ENVIADA. Mais estrito que o roteamento: se a variável
 * apontar para qualquer número diferente do esperado no ambiente (ex.: o número 0200), não se envia nada.
 * - Produção: `WHATSAPP_PHONE_NUMBER_ID` precisa ser exatamente o ID oficial da QUINTA HITS.
 * - Homologação: precisa ser um ID válido e diferente do de produção.
 */
export function idParaEnvio(): string | null {
  const id = soDigitos(process.env.WHATSAPP_PHONE_NUMBER_ID);
  if (ambienteAtual() === "producao") return id === PHONE_NUMBER_ID_QUINTA_HITS ? id : null;
  return idValido(id) && id !== PHONE_NUMBER_ID_QUINTA_HITS ? id : null;
}

/** Versão da Graph API (variável); mantém a versão que o código já usava como padrão. */
export function versaoGraphApi(): string {
  const v = process.env.META_GRAPH_API_VERSION?.trim();
  return v && /^v\d+\.\d+$/.test(v) ? v : "v21.0";
}
