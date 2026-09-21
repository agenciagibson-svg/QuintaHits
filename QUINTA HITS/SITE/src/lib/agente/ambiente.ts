/**
 * Ambiente e interruptores do agente de reservas — sem acesso a banco ou rede.
 *
 * REGRA DURA: o agente da QUINTA HITS só processa o Phone Number ID 1352142871312651 (+55 34 99116-7064).
 * O outro número da GIBSON PROMOÇÕES (final 0200) nunca é tratado, respondido nem alterado por este código.
 *
 * Tudo que liga o agente ou o envio nasce DESLIGADO: variável ausente, vazia ou diferente de "true" = desligado.
 */

/** Phone Number ID oficial da QUINTA HITS na WhatsApp Cloud API. Identificador técnico, não é segredo. */
export const PHONE_NUMBER_ID_QUINTA_HITS = "1352142871312651";

export type Ambiente = "producao" | "homologacao";

/** `APP_AMBIENTE=homologacao` habilita o número de teste; qualquer outro valor (ou ausência) é PRODUÇÃO, o modo estrito. */
export function ambienteAtual(): Ambiente {
  return process.env.APP_AMBIENTE?.trim().toLowerCase() === "homologacao" ? "homologacao" : "producao";
}

const ligado = (v: string | undefined) => v?.trim().toLowerCase() === "true";

/** Interruptor mestre do agente pela variável de ambiente. Só "true" liga. */
export const agenteLigadoPorEnv = () => ligado(process.env.WHATSAPP_AGENT_ENABLED);

/** Interruptor mestre de QUALQUER envio (agente e fluxo atual). Só "true" liga. */
export const envioLigadoPorEnv = () => ligado(process.env.WHATSAPP_SEND_ENABLED);

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
