import type { Ambiente } from "./ambiente";

/**
 * Quando o agente responde e quando o envio real é permitido. Sem acesso a banco ou rede.
 *
 * Vale sempre o MAIS RESTRITIVO entre a variável de ambiente (interruptor mestre, exige novo deploy para ligar) e a
 * configuração do banco (botões do painel, sem deploy). Tudo nasce desligado, restrito a números de teste e
 * com a lista de testes vazia: sem configuração explícita, ninguém recebe resposta do agente.
 */
export type ConfigAgente = {
  ambiente: Ambiente;
  agente_ativo: boolean;
  envio_ativo: boolean;
  transferencia_humana_ativa: boolean;
  pausa_emergencia: boolean;
  restringir_a_numeros_teste: boolean;
  numeros_teste: string[];
  limite_entradas_por_contato_hora: number;
  limite_saidas_por_contato_hora: number;
};

export type Flags = { envAgente: boolean; envEnvio: boolean; ambienteApp: Ambiente };

export type Decisao = { ativo: boolean; motivo: "ok" | "ambiente_divergente" | "pausa_emergencia" | "agente_desligado" | "fora_da_lista_de_teste" };

/** O agente atende este contato agora? */
export function decidirAgente(flags: Flags, config: ConfigAgente, waId: string): Decisao {
  if (config.ambiente !== flags.ambienteApp) return { ativo: false, motivo: "ambiente_divergente" };
  if (config.pausa_emergencia) return { ativo: false, motivo: "pausa_emergencia" };
  if (!flags.envAgente || !config.agente_ativo) return { ativo: false, motivo: "agente_desligado" };
  if (config.restringir_a_numeros_teste && !config.numeros_teste.includes(waId)) return { ativo: false, motivo: "fora_da_lista_de_teste" };
  return { ativo: true, motivo: "ok" };
}

/** Uma mensagem para `para` pode sair AGORA pela Meta? Só com variável, banco, sem pausa e (no modo teste) para número de teste. */
export function decidirEnvio(flags: Flags, config: ConfigAgente, para: string): Decisao {
  if (config.ambiente !== flags.ambienteApp) return { ativo: false, motivo: "ambiente_divergente" };
  if (config.pausa_emergencia) return { ativo: false, motivo: "pausa_emergencia" };
  if (!flags.envEnvio || !config.envio_ativo) return { ativo: false, motivo: "agente_desligado" };
  if (config.restringir_a_numeros_teste && !config.numeros_teste.includes(para)) return { ativo: false, motivo: "fora_da_lista_de_teste" };
  return { ativo: true, motivo: "ok" };
}
