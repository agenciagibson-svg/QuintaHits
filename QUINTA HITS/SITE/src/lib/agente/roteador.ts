/**
 * Roteamento dos eventos do webhook por `phone_number_id`.
 *
 *   webhook único do app  →  assinatura  →  phone_number_id
 *     1352142871312651        → QUINTA HITS
 *     outro ID (ex.: 0200)    → NUNCA processado nem respondido: só registro sanitizado + HTTP 200
 *     ausente                 → idem
 */
/**
 * Número institucional da GIBSON (+55 34 3222-0200): DDD + número, sem o 55. Barreira EXTRA e independente de ambiente:
 * qualquer evento cujo número exibido termine com isso nunca chega ao agente, mesmo que o Phone Number ID configurado
 * (em homologação, por engano) seja o dele.
 */
export const NUMERO_PROTEGIDO_0200 = "3432220200";

export type DestinoEvento = "quinta_hits" | "ignorado_outro_numero" | "ignorado_sem_numero";

/**
 * `idEsperado` é o ID que vale como "a QUINTA HITS" neste ambiente (ver `idQuintaHitsParaRoteamento`).
 * Se for null (configuração insegura), nenhum evento é da QUINTA HITS.
 */
export function classificarDestino(phoneNumberId: string | null, idEsperado: string | null, numeroExibido?: string | null): DestinoEvento {
  if (!phoneNumberId) return "ignorado_sem_numero";
  if (numeroExibido && numeroExibido.replace(/\D/g, "").endsWith(NUMERO_PROTEGIDO_0200)) return "ignorado_outro_numero";
  if (idEsperado && phoneNumberId === idEsperado) return "quinta_hits";
  return "ignorado_outro_numero";
}
